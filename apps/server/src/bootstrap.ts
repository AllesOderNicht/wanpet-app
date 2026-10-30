import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { AppModule } from './app.module';
import { Config } from './config';
import { ApiError, ErrorFilter } from './errors';
import { GameService } from './service';

export async function createApp(config: Config) {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.configure(config), { bodyParser: false, logger: ['error', 'warn'] });
  app.setGlobalPrefix('v1');
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  // Only the local reverse proxy may supply the client IP used by rate limits.
  app.getHttpAdapter().getInstance().set('trust proxy', 'loopback');
  app.use((request: { headers: Record<string, string | undefined>; method: string }, response: { setHeader(k: string, v: string): void }, next: (error?: unknown) => void) => {
    response.setHeader('X-Request-Id', randomUUID());
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = request.headers.origin;
    if (origin && !config.origins.includes(origin)) return next(new ApiError(403, 'ORIGIN_FORBIDDEN', 'Origin is not allowed'));
    if (['POST', 'PUT', 'PATCH'].includes(request.method) && request.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== 'application/json') return next(new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Use application/json'));
    next();
  });
  app.enableCors({ origin: config.origins, methods: ['GET', 'POST', 'PUT', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'], exposedHeaders: ['X-Request-Id', 'Retry-After'] });
  // Authenticate large uploads before allocating their JSON body.
  app.use('/v1/me/media', (req: { method: string; headers: Record<string, string | undefined> }, _res: unknown, next: (error?: unknown) => void) => {
    if (req.method !== 'POST') return next();
    void app.get(GameService).authenticate(req.headers.authorization).then(() => next(), next);
  });
  app.useBodyParser('json', { limit: '14mb', verify: (request: { originalUrl: string }, _response: unknown, body: Buffer) => {
    const limit = request.originalUrl === '/v1/me/media' ? 14 * 1024 * 1024 : request.originalUrl === '/v1/me/pet/speech' ? 3 * 1024 * 1024 : 16384;
    if (body.length > limit) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  } });
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();
  await app.get(GameService).passwords.dummy;
  return app;
}
