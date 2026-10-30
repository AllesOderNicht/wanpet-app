import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ChatTurn, ImageJob, MediaAsset, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ImageJobView, MediaView, Postcards, ImageBudgetView } from '@wanpet/contracts' with { 'resolution-mode': 'import' };
import type { Config } from './config';
import { databaseNow, Transaction } from './database';
import { GameService, Identity } from './service';
import { ApiError } from './errors';
import { digest, object } from './security';
import { ImageStore, uploadedBytes } from './image-store';
import { ImageProvider, ImageProviderError } from './seedream';

const processing = ['queued', 'submitted', 'saving'];
const json = (data: unknown) => data as Prisma.InputJsonValue;
const imageId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
export const mediaView = (a: MediaAsset): MediaView => ({ id: a.id, width: a.width, height: a.height, kind: a.kind as MediaView['kind'] });
export const imageJobView = (j: ImageJob & { image?: MediaAsset | null }): ImageJobView => ({ id: j.id, origin: j.origin as ImageJobView['origin'], status: j.status as ImageJobView['status'], prompt: j.prompt, referenceIds: j.referenceIds, image: j.image && !j.image.deletedAt ? mediaView(j.image) : null, error: j.error, attempt: j.attempt });
export function explicitImageRequest(text: string) {
  if (/(?:不要|不用|别|无需).{0,12}(?:画|生图|生成|修改图片)|\b(?:don't|do not)\b.{0,20}(?:draw|generate|edit)/i.test(text)) return false;
  return /(?:^|请|帮我|给我|替我|麻烦|能不能|可以|我想要|我想请你|你)(?:.{0,8})(?:画(?:一|个|张|幅|出|下)|绘制|生图|生成.{0,8}(?:图|照片|插画)|修改.{0,8}(?:图|照片)|把.{0,60}(?:画成|改成|变成))|^(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:draw|paint|generate|create|edit)\b/i.test(text.trim());
}
export function giftTopic(text: string) { return /风景|旅行|森林|海边|星空|花园|梦|故事|画面|想象|日落|下雪|春天|秋天|scenery|dream|story|garden|sunset/i.test(text); }

export class ImageService implements OnModuleInit, OnModuleDestroy {
  readonly store: ImageStore;
  private timer?: ReturnType<typeof setInterval>;
  private running = new Map<string, { abort: AbortController; done: Promise<void> }>();
  private ticking = false;
  private stopped = false;
  private lastCleanup = 0;
  private lastFailure = 0;
  private report(phase: string, error: unknown) {
    if (Date.now() - this.lastFailure < 10000) return; this.lastFailure = Date.now();
    console.warn(JSON.stringify({ event: 'image_worker_error', phase, type: error instanceof Error ? error.name : 'unknown', code: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined }));
  }
  constructor(private game: GameService, private config: Config, public provider?: ImageProvider) { this.store = new ImageStore(config.mediaRoot ?? resolve('.data/pet-images')); }
  get enabled() { return !!this.provider && !!this.config.images; }
  onModuleInit() { this.timer = setInterval(() => { void this.tick(); }, 1000); this.timer.unref(); }
  async onModuleDestroy() { this.stopped = true; clearInterval(this.timer); for (const r of this.running.values()) r.abort.abort(); await Promise.allSettled([...this.running.values()].map(r => r.done)); }
  async upload(identity: Identity, key: string, input: unknown) {
    const body = object(input, ['data']), bytes = uploadedBytes(body.data);
    const prepared = await this.store.normalize(bytes);
    return this.game.mutate(identity, key, 'image.upload', { digest: digest(bytes.toString('base64')) }, async tx => {
      const count = await tx.mediaAsset.count({ where: { accountId: identity.accountId, turnId: null, deletedAt: null, kind: 'upload' } });
      if (count >= 20) throw new ApiError(429, 'IMAGE_UPLOAD_LIMIT', 'Remove unused uploads before adding more');
      const id = randomUUID(); await this.store.save(id, prepared);
      const asset = await tx.mediaAsset.create({ data: { id, accountId: identity.accountId, kind: 'upload', width: prepared.width, height: prepared.height, bytes: prepared.bytes } });
      return { status: 201, body: mediaView(asset) };
    });
  }
  async bind(tx: Transaction, identity: Identity, turnId: string, ids: string[]) {
    if (ids.length > 4 || new Set(ids).size !== ids.length || ids.some(id => !imageId(id))) throw new ApiError(400, 'INVALID_IMAGE', 'Choose at most four images');
    const found = await tx.mediaAsset.findMany({ where: { id: { in: ids }, accountId: identity.accountId, deletedAt: null, turnId: null, kind: 'upload' } });
    if (found.length !== ids.length) throw new ApiError(404, 'IMAGE_NOT_FOUND', 'Image is missing or already attached');
    await tx.mediaAsset.updateMany({ where: { id: { in: ids } }, data: { turnId } });
  }
  async asset(identity: Identity, id: string) {
    if (!imageId(id)) throw new ApiError(400, 'INVALID_INPUT', 'Invalid image id');
    const row = await this.game.db.mediaAsset.findFirst({ where: { id, deletedAt: null, OR: [{ kind: 'postcard' }, { accountId: identity.accountId, OR: [{ turnId: null }, { turn: { hidden: false } }] }] } });
    if (!row) throw new ApiError(404, 'IMAGE_NOT_FOUND', 'Image was not found');
    return row;
  }
  async removeUpload(identity: Identity, key: string, id: string) {
    return this.game.mutate(identity, key, 'image.remove-upload', { id }, async tx => {
      const changed = await tx.mediaAsset.updateMany({ where: { id, accountId: identity.accountId, turnId: null, kind: 'upload', deletedAt: null }, data: { deletedAt: await databaseNow(tx) } });
      if (!changed.count) throw new ApiError(404, 'IMAGE_NOT_FOUND', 'Unused image was not found');
      return { status: 200, body: { id } };
    });
  }
  async annotate(turns: ChatTurn[]) {
    const ids = turns.map(t => t.id), assets = await this.game.db.mediaAsset.findMany({ where: { turnId: { in: ids }, kind: 'upload', deletedAt: null }, orderBy: { createdAt: 'asc' } });
    const jobs = await this.game.db.imageJob.findMany({ where: { turnId: { in: ids } }, include: { image: true } });
    return new Map(turns.map(t => [t.id, { images: assets.filter(a => a.turnId === t.id).map(mediaView), imageJob: jobs.find(j => j.turnId === t.id) ? imageJobView(jobs.find(j => j.turnId === t.id)!) : null }]));
  }
  async context(turns: ChatTurn[], accountId: string) {
    const rows = await this.game.db.mediaAsset.findMany({ where: { accountId, turnId: { in: turns.map(t => t.id) }, deletedAt: null, turn: { hidden: false } }, orderBy: { createdAt: 'desc' }, take: 12 });
    return rows.reverse().map(row => ({ id: row.id, turnId: row.turnId, kind: row.kind, path: this.store.path(row.id, row.turnId !== turns[0]?.id || row.kind !== 'upload') }));
  }
  private async references(tx: Transaction, turn: ChatTurn, accountId: string, ids: string[]) {
    const found = await tx.mediaAsset.findMany({ where: { id: { in: ids }, accountId, deletedAt: null, turn: { petId: turn.petId, hidden: false, epoch: turn.epoch } } });
    if (found.length !== ids.length) throw new ApiError(404, 'IMAGE_NOT_FOUND', 'Reference image is unavailable');
  }
  async fromTool(tx: Transaction, turn: ChatTurn, accountId: string, name: string, args: unknown) {
    const body = object(args, name === 'gift_image' ? ['prompt'] : ['prompt', 'referenceIds']);
    if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 2000 || body.prompt.includes('\0')) throw new ApiError(400, 'INVALID_INPUT', 'Invalid image prompt');
    const ids = body.referenceIds ?? [];
    if (!Array.isArray(ids) || ids.length > 4 || ids.some(id => !imageId(id)) || new Set(ids).size !== ids.length) throw new ApiError(400, 'INVALID_IMAGE', 'Invalid references');
    const existing = await tx.imageJob.findUnique({ where: { turnId: turn.id }, include: { image: true } });
    if (existing) return imageJobView(existing);
    if (name === 'generate_image' && !turn.imageIntent && !explicitImageRequest(turn.userText)) return { status: 'not_authorized', reason: '先使用 propose_image 提议，主人确认后再生成。' };
    if (name === 'gift_image') {
      if (await tx.mediaAsset.count({ where: { turnId: turn.id, kind: 'upload' } }) || !this.enabled || turn.imageIntent || explicitImageRequest(turn.userText) || !giftTopic(turn.userText) || turn.imageRoll >= 5) return { status: 'not_selected', reason: '本轮不主动生图，继续文字聊天。' };
      const day = (await databaseNow(tx)).toISOString().slice(0, 10);
      if (await tx.imageGift.findUnique({ where: { petId_day: { petId: turn.petId, day } } })) return { status: 'daily_limit', reason: '今天已经送过图片，继续文字聊天。' };
      await tx.imageGift.create({ data: { petId: turn.petId, day, turnId: turn.id } });
    }
    await this.references(tx, turn, accountId, ids as string[]);
    const proposed = name === 'propose_image';
    const job = await tx.imageJob.create({ data: { accountId, petId: turn.petId, turnId: turn.id, epoch: turn.epoch, prompt: body.prompt.trim(), referenceIds: ids as string[],
      origin: proposed ? 'proposal' : name === 'gift_image' ? 'gift' : 'request', status: proposed ? 'proposed' : this.enabled ? 'queued' : 'failed', error: !proposed && !this.enabled ? 'IMAGE_GENERATION_NOT_CONFIGURED' : null } });
    await this.event(tx, job); return imageJobView(job);
  }
  private async event(tx: Transaction, job: ImageJob) {
    if (job.turnId) await tx.chatEvent.create({ data: { turnId: job.turnId, type: 'image', data: { jobId: job.id, status: job.status, error: job.error } } });
  }
  private async valid(tx: Transaction, job: ImageJob) {
    if (!job.turnId) return true;
    await tx.$queryRaw`SELECT "petId" FROM "ChatRoom" WHERE "petId"=${job.petId}::uuid FOR UPDATE`;
    return !!await tx.chatTurn.findFirst({ where: { id: job.turnId, hidden: false, epoch: job.epoch!, room: { epoch: job.epoch! } } });
  }
  async control(identity: Identity, key: string, id: string, action: 'confirm' | 'retry' | 'cancel') {
    const result = await this.game.mutate(identity, key, 'image.' + action, { id }, async tx => {
      const job = await tx.imageJob.findFirst({ where: { id, accountId: identity.accountId, turn: { hidden: false } } });
      if (!job) throw new ApiError(404, 'IMAGE_JOB_NOT_FOUND', 'Image task was not found');
      if (!await this.valid(tx, job)) throw new ApiError(409, 'CHAT_CONTEXT_CHANGED', 'Context changed; send a new request');
      if (action === 'cancel') {
        if (['proposed', ...processing].includes(job.status)) { const updated = await tx.imageJob.update({ where: { id }, data: { status: 'cancelled', resultUrl: null } }); await this.event(tx, updated); }
      } else {
        if (!this.enabled) throw new ApiError(503, 'IMAGE_GENERATION_NOT_CONFIGURED', 'Image generation is not configured');
        if (action === 'confirm' && job.status !== 'proposed') return { status: 200, body: { id } };
        if (action === 'retry' && (!['failed', 'unknown'].includes(job.status) || !['request', 'proposal'].includes(job.origin))) throw new ApiError(409, 'IMAGE_NOT_RETRYABLE', 'Only explicitly requested failed images can be retried');
        const updated = await tx.imageJob.update({ where: { id }, data: { status: 'queued', error: null, resultUrl: null, nextAt: await databaseNow(tx), saveAttempts: 0, ...(action === 'retry' ? { attempt: { increment: 1 } } : {}) } }); await this.event(tx, updated);
      }
      return { status: 200, body: { id } };
    });
    if (action === 'cancel') this.running.get(id)?.abort.abort(); return result;
  }
  async cancelContext(tx: Transaction, petId: string, removedTurnId?: string) {
    const removed = removedTurnId ? await tx.mediaAsset.findMany({ where: { turnId: removedTurnId, deletedAt: null } }) : [];
    if (removed.length) await tx.mediaAsset.updateMany({ where: { id: { in: removed.map(a => a.id) } }, data: { deletedAt: await databaseNow(tx) } });
    await tx.imageJob.updateMany({ where: { petId, turnId: { not: null }, status: { in: ['proposed', ...processing] } }, data: { status: 'cancelled', resultUrl: null, error: 'CHAT_CONTEXT_CHANGED' } });
    if (removedTurnId) await tx.imageJob.updateMany({ where: { turnId: removedTurnId }, data: { prompt: '', referenceIds: [], resultUrl: null, status: 'cancelled' } });
  }
  async budget(): Promise<ImageBudgetView> {
    const now = await databaseNow(this.game.db), day = now.toISOString().slice(0, 10);
    return { enabled: this.enabled, limitFen: this.config.images?.dailyBudgetFen ?? 1000, usedFen: (await this.game.db.imageBudget.findUnique({ where: { day } }))?.usedFen ?? 0, resetsAt: new Date(Date.parse(day) + 86400000).toISOString() };
  }
  async postcards(identity: Identity, before?: string): Promise<Postcards> {
    const prior = before ? await this.game.db.imageJob.findFirst({ where: { id: before, accountId: identity.accountId, origin: 'postcard', trip: { claimedAt: { not: null } } } }) : null;
    if (before && !prior) throw new ApiError(404, 'IMAGE_JOB_NOT_FOUND', 'Postcard was not found');
    const jobs = await this.game.db.imageJob.findMany({ where: { accountId: identity.accountId, origin: 'postcard', trip: { claimedAt: { not: null } }, ...(prior ? { OR: [{ createdAt: { lt: prior.createdAt } }, { createdAt: prior.createdAt, id: { lt: prior.id } }] } : {}) }, include: { image: true, trip: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 30 });
    return { items: jobs.map(j => ({ tripId: j.tripId!, destinationId: j.destination!, theme: j.theme!, createdAt: j.createdAt.toISOString(), claimed: !!j.trip?.claimedAt, job: imageJobView(j) })), before: jobs.length === 30 ? jobs.at(-1)!.id : null };
  }
  private async fallback(tx: Transaction, job: ImageJob, error: string, unknown = false) {
    const image = job.origin === 'postcard' ? await tx.mediaAsset.findFirst({ where: { kind: 'postcard', deletedAt: null, destination: job.destination, appearance: job.appearance, theme: job.theme, style: job.style }, orderBy: { createdAt: 'desc' } }) : null;
    const updated = await tx.imageJob.update({ where: { id: job.id }, data: { status: job.origin === 'postcard' ? 'fallback' : unknown ? 'unknown' : 'failed', error, resultUrl: null, imageId: image?.id } });
    await this.event(tx, updated);
  }
  private async dispatch(original: ImageJob, abort: AbortController) {
    let references: Buffer[];
    try {
      references = await Promise.all(original.referenceIds.map(id => this.store.read(id)));
      if (original.origin === 'postcard') {
        if (original.appearance !== 'calico-v1' || !this.config.images) throw new Error('Image reference unavailable');
        references = [(await this.store.normalize(await readFile(this.config.images.referencePath))).data];
      }
    } catch {
      await this.game.db.$transaction(async tx => { const j = await tx.imageJob.findUniqueOrThrow({ where: { id: original.id } }); if (j.status === 'queued' && j.attempt === original.attempt) await this.fallback(tx, j, this.enabled ? 'IMAGE_REFERENCE_UNAVAILABLE' : 'IMAGE_GENERATION_NOT_CONFIGURED'); }); return;
    }
    const job = await this.game.db.$transaction(async tx => {
      if (!await this.valid(tx, original)) return null;
      const current = await tx.imageJob.findUniqueOrThrow({ where: { id: original.id } });
      if (current.status !== 'queued' || current.attempt !== original.attempt) return null;
      if (!this.enabled) { await this.fallback(tx, current, 'IMAGE_GENERATION_NOT_CONFIGURED'); return null; }
      const config = this.config.images!, day = (await databaseNow(tx)).toISOString().slice(0, 10);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(924801)`;
      const budget = await tx.imageBudget.upsert({ where: { day }, create: { day }, update: {} });
      if (budget.usedFen + config.unitPriceFen > config.dailyBudgetFen) { await this.fallback(tx, current, 'IMAGE_BUDGET_EXHAUSTED'); return null; }
      await tx.imageBudget.update({ where: { day }, data: { usedFen: { increment: config.unitPriceFen } } });
      await tx.imageCharge.create({ data: { jobId: current.id, attempt: current.attempt, day, amountFen: config.unitPriceFen } });
      const updated = await tx.imageJob.update({ where: { id: current.id }, data: { status: 'submitted', model: config.model, submittedAt: await databaseNow(tx) } }); await this.event(tx, updated); return updated;
    });
    if (!job) return;
    try {
      const result = await this.provider!.generate({ prompt: job.prompt, references, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(120000)]) });
      await this.game.db.$transaction(async tx => {
        const valid = await this.valid(tx, job), current = await tx.imageJob.findUniqueOrThrow({ where: { id: job.id } });
        await tx.imageCharge.updateMany({ where: { jobId: job.id, attempt: job.attempt, status: 'reserved' }, data: { status: 'charged' } });
        if (!valid || current.status !== 'submitted' || current.attempt !== job.attempt) return;
        const updated = await tx.imageJob.update({ where: { id: job.id }, data: { status: 'saving', resultUrl: result.url, nextAt: await databaseNow(tx) } }); await this.event(tx, updated);
      });
    } catch (error) {
      const noCharge = error instanceof ImageProviderError && error.noCharge;
      await this.game.db.$transaction(async tx => {
        await this.valid(tx, job);
        const current = await tx.imageJob.findUniqueOrThrow({ where: { id: job.id } });
        const charge = await tx.imageCharge.findUniqueOrThrow({ where: { jobId_attempt: { jobId: job.id, attempt: job.attempt } } });
        if (charge.status === 'reserved') {
          await tx.imageCharge.update({ where: { jobId_attempt: { jobId: job.id, attempt: job.attempt } }, data: { status: noCharge ? 'released' : 'uncertain' } });
          if (noCharge) { await tx.$executeRaw`SELECT pg_advisory_xact_lock(924801)`; await tx.imageBudget.update({ where: { day: charge.day }, data: { usedFen: { decrement: charge.amountFen } } }); }
        }
        if (current.status === 'submitted' && current.attempt === job.attempt) await this.fallback(tx, current, error instanceof ImageProviderError ? error.code : 'IMAGE_RESULT_UNKNOWN', !noCharge);
      });
    }
  }
  private async save(job: ImageJob, abort: AbortController) {
    try {
      if (!this.provider || !job.resultUrl) throw new Error('No result');
      const data = await this.store.normalize(await this.provider.download(job.resultUrl, AbortSignal.any([abort.signal, AbortSignal.timeout(30000)])), 4096);
      await this.store.save(job.id, data);
      const published = await this.game.db.$transaction(async tx => {
        const valid = await this.valid(tx, job), current = await tx.imageJob.findUniqueOrThrow({ where: { id: job.id } });
        if (!valid || current.status !== 'saving' || current.attempt !== job.attempt) return false;
        const shared = job.origin === 'postcard';
        const asset = await tx.mediaAsset.create({ data: { id: job.id, accountId: shared ? null : job.accountId, turnId: job.turnId, kind: shared ? 'postcard' : 'chat', width: data.width, height: data.height, bytes: data.bytes, ...(shared ? { destination: job.destination, appearance: job.appearance, theme: job.theme, style: job.style } : {}) } });
        const updated = await tx.imageJob.update({ where: { id: job.id }, data: { status: 'completed', imageId: asset.id, resultUrl: null } }); await this.event(tx, updated); return true;
      });
      if (!published && !await this.game.db.mediaAsset.findFirst({ where: { id: job.id, deletedAt: null } })) await this.store.remove(job.id);
    } catch {
      await this.game.db.$transaction(async tx => {
        await this.valid(tx, job);
        const current = await tx.imageJob.findUniqueOrThrow({ where: { id: job.id } });
        if (current.status !== 'saving' || current.attempt !== job.attempt) return;
        if (job.saveAttempts >= 7) await this.fallback(tx, current, 'IMAGE_SAVE_FAILED');
        else await tx.imageJob.update({ where: { id: job.id }, data: { saveAttempts: { increment: 1 }, nextAt: new Date(Date.now() + Math.min(300000, 1000 * 2 ** job.saveAttempts)) } });
      });
    }
  }
  async tick() {
    if (this.ticking || this.stopped) return; this.ticking = true;
    try {
      for (const [id, run] of this.running) { const row = await this.game.db.imageJob.findUnique({ where: { id } }); if (row?.status === 'cancelled') run.abort.abort(); }
      const stranded = await this.game.db.imageJob.findMany({ where: { status: 'submitted', submittedAt: { lt: new Date(Date.now() - 130000) }, id: { notIn: [...this.running.keys()] } }, take: 20 });
      for (const job of stranded) await this.game.db.$transaction(async tx => {
        await this.valid(tx, job); const current = await tx.imageJob.findUniqueOrThrow({ where: { id: job.id } });
        if (current.status !== 'submitted' || current.attempt !== job.attempt) return;
        await tx.imageCharge.updateMany({ where: { jobId: job.id, attempt: job.attempt, status: 'reserved' }, data: { status: 'uncertain' } });
        await this.fallback(tx, current, 'IMAGE_RESULT_UNKNOWN', true);
      });
      const jobs = await this.game.db.imageJob.findMany({ where: { status: { in: ['queued', 'saving'] }, nextAt: { lte: new Date() }, id: { notIn: [...this.running.keys()] } }, orderBy: { createdAt: 'asc' }, take: Math.max(0, 2 - this.running.size) });
      for (const job of jobs) {
        const abort = new AbortController();
        const done = (job.status === 'saving' ? this.save(job, abort) : this.dispatch(job, abort)).catch(error => this.report(job.status, error)).finally(() => this.running.delete(job.id));
        this.running.set(job.id, { abort, done });
      }
      if (Date.now() - this.lastCleanup > 60000) { this.lastCleanup = Date.now(); await this.cleanup(); }
    } catch (error) { this.report('tick', error); }
    finally { this.ticking = false; }
  }
  private async cleanup() {
    await this.game.db.mediaAsset.updateMany({ where: { kind: 'upload', turnId: null, deletedAt: null, createdAt: { lt: new Date(Date.now() - 86400000) } }, data: { deletedAt: new Date() } });
    for (const row of await this.game.db.mediaAsset.findMany({ where: { deletedAt: { not: null } } })) await this.store.remove(row.id);
    const kept = await this.game.db.mediaAsset.findMany({ where: { deletedAt: null }, select: { id: true } });
    await this.store.cleanOrphans(new Set(kept.map(r => r.id)), Date.now() - 86400000);
  }
}
