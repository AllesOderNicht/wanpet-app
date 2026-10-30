import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ImageService } from './image-service';
import { GameService } from './service';
import { idempotencyKey, object, RateLimits } from './security';
import { resourceId } from './chat-service';
import { ApiError } from './errors';
type Request = { headers: Record<string, string | string[] | undefined> };
@Controller('me')
export class ImageController {
  private limits = new RateLimits();
  constructor(@Inject(GameService) private game: GameService, @Inject(ImageService) private images: ImageService) {}
  private async identity(req: Request, write = false) {
    const identity = await this.game.authenticate(req.headers.authorization);
    this.limits.take(`images:${identity.accountId}:${write}`, write ? 20 : 360, 60000); return identity;
  }
  @Post('media') async upload(@Req() req: Request, @Body() body: unknown) { return (await this.images.upload(await this.identity(req, true), idempotencyKey(req.headers['idempotency-key']), body)).body; }
  @Post('media/:id/delete') @HttpCode(200) async remove(@Req() req: Request, @Param('id') id: string, @Body() body: unknown) { object(body, []); return (await this.images.removeUpload(await this.identity(req, true), idempotencyKey(req.headers['idempotency-key']), resourceId(id))).body; }
  @Get('media/:id/content') async content(@Req() req: Request, @Param('id') id: string, @Query('preview') preview = '0', @Res() res: { setHeader(k: string, v: string): void; send(body: Buffer): void }) {
    if (!['0', '1'].includes(preview)) throw new ApiError(400, 'INVALID_INPUT', 'Invalid image variant');
    const asset = await this.images.asset(await this.identity(req), resourceId(id));
    let data: Buffer; try { data = await this.images.store.read(asset.id, preview === '1'); } catch { throw new ApiError(503, 'IMAGE_FILE_UNAVAILABLE', 'Image is temporarily unavailable'); }
    res.setHeader('Content-Type', 'image/jpeg'); res.setHeader('Content-Disposition', 'inline; filename="image.jpg"'); res.setHeader('Cache-Control', 'no-store'); res.send(data);
  }
  @Get('pet/images/budget') async budget(@Req() req: Request) { await this.identity(req); return this.images.budget(); }
  @Post('pet/images/:id/:action') @HttpCode(200) async control(@Req() req: Request, @Param('id') id: string, @Param('action') action: string, @Body() body: unknown) {
    object(body, []); if (!['confirm', 'retry', 'cancel'].includes(action)) throw new ApiError(404, 'NOT_FOUND', 'Unknown operation');
    return (await this.images.control(await this.identity(req, true), idempotencyKey(req.headers['idempotency-key']), resourceId(id), action as 'confirm' | 'retry' | 'cancel')).body;
  }
  @Get('postcards') async postcards(@Req() req: Request, @Query('before') before?: string) { return this.images.postcards(await this.identity(req), before ? resourceId(before) : undefined); }
}
