import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

export class ApiError extends HttpException {
  constructor(status: number, public readonly code: string, message: string, public readonly retryAfter?: number) {
    super(message, status);
  }
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    const unavailable = error instanceof Prisma.PrismaClientInitializationError || (error instanceof Prisma.PrismaClientKnownRequestError && ['P1001', 'P1002', 'P1008', 'P1017', 'P2024'].includes(error.code));
    const parserType = typeof error === 'object' && error !== null && 'type' in error ? error.type : undefined;
    const status = error instanceof HttpException ? error.getStatus() : parserType === 'entity.too.large' ? 413 : parserType === 'entity.parse.failed' ? 400 : unavailable ? 503 : 500;
    const code = error instanceof ApiError ? error.code : status === 400 ? 'INVALID_INPUT' : status === 404 ? 'NOT_FOUND' : status === 413 ? 'PAYLOAD_TOO_LARGE' : unavailable ? 'DATABASE_UNAVAILABLE' : 'INTERNAL_ERROR';
    const requestId = response.getHeader('X-Request-Id') ?? randomUUID();
    if (error instanceof ApiError && error.retryAfter) response.setHeader('Retry-After', String(error.retryAfter));
    // Never serialize exception messages: driver errors can contain connection strings.
    if (status >= 500) console.error(JSON.stringify({ requestId, code, status }));
    response.setHeader('Cache-Control', 'no-store');
    response.status(status).json({ code, message: error instanceof ApiError ? error.message : 'Request could not be completed', requestId });
  }
}
