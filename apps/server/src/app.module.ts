import { Body, Controller, DynamicModule, Get, HttpCode, Inject, Module, Param, Post, Put, Req, Res } from '@nestjs/common';
import { Config } from './config';
import { Database } from './database';
import { ApiError } from './errors';
import { email, idempotencyKey, object, password, RateLimits, username } from './security';
import { GameService } from './service';
import { startTripRequest, tripId } from './travel';
import { catLifeRequest, petCareRequest } from './cat-life';
import { petProfileRequest } from './pet-profile';
import { CatLifeService } from './cat-life-service';
import { JevDecisions } from './jev';
import { ChatController } from './chat-controller';
import { ChatService } from './chat-service';
import { CodexPetAgent } from './pet-agent';
import { Mem0Gateway } from './memory-gateway';
import { SpeechService, cloudTranscriber } from './speech-service';
import { ImageService } from './image-service';
import { ImageController } from './image-controller';
import { SeedreamProvider } from './seedream';

type Request = { headers: Record<string, string | string[] | undefined>; ip?: string };
type Response = { status(value: number): void };
@Controller()
class ApiController {
  private readonly limits = new RateLimits();
  constructor(@Inject(GameService) private readonly service: GameService, @Inject(CatLifeService) private readonly cats: CatLifeService) {}
  @Get('health') health() { return { status: 'ok', gameplayReady: false }; }
  @Get('ready') ready() { return this.service.ready(); }
  @Post('auth/register')
  register(@Body() input: unknown, @Req() request: Request) {
    this.limits.take(`register:${request.ip}`, 5, 3600000);
    const body = object(input, ['email', 'username', 'password']);
    return this.service.register(email(body.email), username(body.username), password(body.password));
  }
  @Post('auth/login') @HttpCode(200)
  login(@Body() input: unknown, @Req() request: Request) {
    this.limits.take(`login:${request.ip}`, 30, 60000);
    const body = object(input, ['email', 'password']);
    const name = email(body.email);
    this.limits.take(`login:${request.ip}:${name}`, 5, 60000);
    return this.service.login(name, password(body.password));
  }
  @Get('auth/session')
  async currentSession(@Req() request: Request) {
    return this.service.currentSession(await this.service.authenticate(request.headers.authorization));
  }
  @Post('auth/logout') @HttpCode(204)
  async logout(@Body() input: unknown, @Req() request: Request) {
    object(input, []);
    await this.service.logout(await this.service.authenticate(request.headers.authorization));
  }
  @Put('auth/password') @HttpCode(204)
  async changePassword(@Body() input: unknown, @Req() request: Request) {
    const identity = await this.service.authenticate(request.headers.authorization);
    this.limits.take(`password:${identity.accountId}`, 3, 3600000);
    const body = object(input, ['currentPassword', 'newPassword']);
    await this.service.changePassword(identity, password(body.currentPassword), password(body.newPassword));
  }
  @Post('me/initialize')
  async initialize(@Body() input: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const identity = await this.service.authenticate(request.headers.authorization);
    object(input, []);
    const result = await this.service.initialize(identity, idempotencyKey(request.headers['idempotency-key']));
    response.status(result.status);
    return result.snapshot;
  }
  @Get('me/snapshot')
  async snapshot(@Req() request: Request) {
    const identity = await this.service.authenticate(request.headers.authorization);
    this.limits.take(`snapshot:${identity.accountId}`, 120, 60000);
    return this.service.snapshot(identity);
  }
  @Post('me/trips')
  async startTrip(@Body() input: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const identity = await this.service.authenticate(request.headers.authorization);
    this.limits.take(`trip-start:${identity.accountId}`, 120, 60000);
    const result = await this.service.startTrip(identity, idempotencyKey(request.headers['idempotency-key']), startTripRequest(input));
    response.status(result.status);
    return result.body;
  }
  @Get('me/pet/life')
  async petLifeView(@Req() request: Request) { return this.cats.view(await this.service.authenticate(request.headers.authorization)); }
  @Post('me/pet/life') @HttpCode(200)
  async catLife(@Body() input: unknown, @Req() request: Request) {
    const identity = await this.service.authenticate(request.headers.authorization);
    this.limits.take(`cat-life:${identity.accountId}`, 30, 60000);
    return (await this.cats.advance(identity, idempotencyKey(request.headers['idempotency-key']), catLifeRequest(input))).body;
  }
  @Get('me/pet/profile')
  async petProfile(@Req() request: Request) { return this.cats.profile(await this.service.authenticate(request.headers.authorization)); }
  @Post('me/pet/profile') @HttpCode(200)
  async updatePetProfile(@Body() input: unknown, @Req() request: Request) {
    const identity = await this.service.authenticate(request.headers.authorization);
    this.limits.take(`pet-profile:${identity.accountId}`, 20, 60000);
    return (await this.cats.updateProfile(identity, idempotencyKey(request.headers['idempotency-key']), petProfileRequest(input))).body;
  }
  @Post('me/pet/care') @HttpCode(200)
  async petCare(@Body() input: unknown, @Req() request: Request) {
    const identity = await this.service.authenticate(request.headers.authorization);
    this.limits.take(`pet-care:${identity.accountId}`, 30, 60000);
    return (await this.cats.care(identity, idempotencyKey(request.headers['idempotency-key']), petCareRequest(input))).body;
  }
  @Post('me/trips/:id/claim')
  async claimTrip(@Param('id') id: string, @Body() input: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const identity = await this.service.authenticate(request.headers.authorization);
    this.limits.take(`trip-claim:${identity.accountId}`, 120, 60000);
    object(input, []);
    const result = await this.service.claimTrip(identity, idempotencyKey(request.headers['idempotency-key']), tripId(id));
    response.status(result.status);
    return result.body;
  }
}
@Module({})
export class AppModule {
  static configure(config: Config): DynamicModule {
    return { module: AppModule, controllers: [ApiController, ChatController, ImageController], providers: [
      { provide: 'WANPET_CONFIG', useValue: config },
      { provide: Database, useFactory: () => new Database({ datasources: { db: { url: config.databaseUrl } } }) }, GameService, CatLifeService,
      { provide: JevDecisions, useFactory: () => new JevDecisions(config.jev) },
      { provide: ImageService, inject: [GameService], useFactory: (game: GameService) => new ImageService(game, config, config.images ? new SeedreamProvider(config.images) : undefined) },
      { provide: ChatService, inject: [GameService, CatLifeService, ImageService], useFactory: (game: GameService, cats: CatLifeService, images: ImageService) => new ChatService(game, cats, config, config.chat ? new CodexPetAgent(config.chat) : undefined, new Mem0Gateway(config), images) },
      { provide: SpeechService, inject: [GameService], useFactory: (game: GameService) => new SpeechService(game, config.speech ? cloudTranscriber(config.speech) : undefined) },
    ] };
  }
}
