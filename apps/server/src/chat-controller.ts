import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { ChatService, chatText, resourceId } from './chat-service';
import { SpeechService } from './speech-service';
import { GameService } from './service';
import { idempotencyKey, object, RateLimits } from './security';
type Request = { headers: Record<string, string | string[] | undefined> };
@Controller('me/pet')
export class ChatController {
  private limits = new RateLimits();
  constructor(@Inject(GameService) private game: GameService, @Inject(ChatService) private chats: ChatService, @Inject(SpeechService) private speech: SpeechService) {}
  private async identity(request: Request, write = false) {
    const identity = await this.game.authenticate(request.headers.authorization);
    this.limits.take(`chat:${identity.accountId}:${write}`, write ? 20 : 360, 60000); return identity;
  }
  @Get('chat') history(@Req() req: Request, @Query('before') before?: string) { return this.identity(req).then(i => this.chats.history(i, before)); }
  @Post('chat') @HttpCode(202) async send(@Req() req: Request, @Body() body: unknown) { return (await this.chats.submit(await this.identity(req, true), idempotencyKey(req.headers['idempotency-key']), body)).body; }
  @Get('chat/:id/events') async events(@Req() req: Request, @Param('id') id: string, @Query('after') after = '0') { return this.chats.events(await this.identity(req), resourceId(id), Number(after)); }
  @Post('chat/:id/stop') @HttpCode(200) async stop(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) { object(body, []); return (await this.chats.control(await this.identity(req, true), idempotencyKey(req.headers['idempotency-key']), resourceId(id), 'stop')).body; }
  @Post('chat/:id/retry') @HttpCode(200) async retry(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) { object(body, []); return (await this.chats.control(await this.identity(req, true), idempotencyKey(req.headers['idempotency-key']), resourceId(id), 'retry')).body; }
  @Post('chat/:id/delete') @HttpCode(200) async remove(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) { object(body, []); return (await this.chats.control(await this.identity(req, true), idempotencyKey(req.headers['idempotency-key']), resourceId(id), 'delete')).body; }
  @Get('memories') async memories(@Req() req: Request) { return this.chats.memories(await this.identity(req)); }
  @Post('memories/clear') @HttpCode(200) async clear(@Req() req: Request, @Body() body: unknown) { object(body, []); return (await this.chats.manageMemory(await this.identity(req, true), idempotencyKey(req.headers['idempotency-key']), 'clear')).body; }
  @Post('memories/:id/update') @HttpCode(200) async update(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) { const input = object(body, ['text']); return (await this.chats.manageMemory(await this.identity(req, true), idempotencyKey(req.headers['idempotency-key']), 'update', resourceId(id), chatText(input.text, 1000))).body; }
  @Post('memories/:id/delete') @HttpCode(200) async forget(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) { object(body, []); return (await this.chats.manageMemory(await this.identity(req, true), idempotencyKey(req.headers['idempotency-key']), 'delete', resourceId(id))).body; }
  @Post('speech') @HttpCode(202) async record(@Req() req: Request, @Body() body: unknown) { return (await this.speech.submit(await this.identity(req, true), idempotencyKey(req.headers['idempotency-key']), body)).body; }
  @Get('speech/:id') async transcription(@Req() req: Request, @Param('id') id: string) { return this.speech.get(await this.identity(req), resourceId(id)); }
  @Post('speech/:id/cancel') @HttpCode(200) async cancel(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) { object(body, []); return (await this.speech.cancel(await this.identity(req, true), idempotencyKey(req.headers['idempotency-key']), resourceId(id))).body; }
}
