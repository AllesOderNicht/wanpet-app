import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, ChatTurn } from '@prisma/client';
import type { CatActivity, CatSurface, ChatEvents, ChatHistory, ChatTurnView, PetInvitation, PetMemories } from '@wanpet/contracts' with { 'resolution-mode': 'import' };
import { GameService, Identity } from './service';
import { CatLifeService } from './cat-life-service';
import { Config } from './config';
import { databaseNow, Transaction } from './database';
import { ApiError } from './errors';
import { object } from './security';
import { AgentRunner, PET_ACTIVITIES } from './pet-agent';
import { MemoryBackend, StoredMemory } from './memory-gateway';
import { mayRemember } from './memory-policy';
import { randomInt } from 'node:crypto';
import { ImageService, giftTopic } from './image-service';

const active = ['queued', 'running'];
const json = (value: unknown) => value as Prisma.InputJsonValue;
export function chatText(value: unknown, max = 4000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /\u0000/.test(value)) throw new ApiError(400, 'INVALID_INPUT', 'Invalid text');
  return value.trim();
}
export function resourceId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)) throw new ApiError(400, 'INVALID_INPUT', 'Invalid id');
  return value;
}
const view = (turn: ChatTurn): ChatTurnView => ({ id: turn.id, userText: turn.userText, reply: turn.reply, status: turn.status as ChatTurnView['status'], createdAt: turn.createdAt.toISOString(), error: turn.error, invitation: turn.invitation as unknown as PetInvitation | null, memoryStatus: turn.memoryStatus as ChatTurnView['memoryStatus'] });
export class ChatService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = new Map<string, { abort: AbortController; done: Promise<void> }>();
  private ticking = false;
  private memoryBusy = false;
  // shortcut: one API instance owns memory maintenance; add per-pet durable leases before running replicas.
  private stopped = false;
  constructor(private game: GameService, private cats: CatLifeService, private config: Config, public agent: AgentRunner | undefined, public memory: MemoryBackend, public images?: ImageService) {}
  onModuleInit() { this.timer = setInterval(() => { void this.tick(); }, 1000); this.timer.unref(); }
  async onModuleDestroy() {
    this.stopped = true; clearInterval(this.timer);
    for (const run of this.running.values()) run.abort.abort();
    this.memory.close(); await Promise.allSettled([...this.running.values()].map(r => r.done));
  }
  private async room(identity: Identity, db: Transaction = this.game.db) {
    const pet = await db.pet.findFirst({ where: { player: { accountId: identity.accountId } } });
    if (!pet) throw new ApiError(409, 'PLAYER_NOT_INITIALIZED', 'Initialize your save first');
    return db.chatRoom.upsert({ where: { petId: pet.id }, create: { petId: pet.id }, update: {} });
  }
  private async owned(identity: Identity, id: string, db: Transaction = this.game.db) {
    const turn = await db.chatTurn.findFirst({ where: { id, hidden: false, room: { pet: { player: { accountId: identity.accountId } } } } });
    if (!turn) throw new ApiError(404, 'CHAT_NOT_FOUND', 'Conversation was not found');
    return turn;
  }
  async history(identity: Identity, before?: string): Promise<ChatHistory> {
    const room = await this.room(identity);
    const cursor = before ? await this.owned(identity, resourceId(before)) : null;
    const turns = await this.game.db.chatTurn.findMany({ where: { petId: room.petId, hidden: false, ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 30 });
    const pictures = await this.images?.annotate(turns);
    return { petId: room.petId, turns: turns.map(t => ({ ...view(t), ...pictures?.get(t.id) })).reverse(), before: turns.length === 30 ? turns.at(-1)!.id : null, chatEnabled: !!this.config.chat, speechEnabled: !!this.config.speech, imageEnabled: this.images?.enabled ?? false };
  }
  async events(identity: Identity, id: string, after: number): Promise<ChatEvents> {
    if (!Number.isSafeInteger(after) || after < 0) throw new ApiError(400, 'INVALID_INPUT', 'Invalid event cursor');
    const turn = await this.owned(identity, id);
    const events = await this.game.db.chatEvent.findMany({ where: { turnId: id, id: { gt: after } }, orderBy: { id: 'asc' }, take: 100 });
    const pictures = await this.images?.annotate([turn]);
    return { turn: { ...view(turn), ...pictures?.get(turn.id) }, events: events.map(e => ({ id: e.id, type: e.type as ChatEvents['events'][number]['type'], data: e.data as Record<string, unknown> })), cursor: events.at(-1)?.id ?? after };
  }
  private async reserve(tx: Transaction, identity: Identity) {
    const day = (await databaseNow(tx)).toISOString().slice(0, 10);
    const usage = await tx.chatUsage.upsert({ where: { accountId_day: { accountId: identity.accountId, day } }, create: { accountId: identity.accountId, day }, update: {} });
    if (usage.turns >= (this.config.chat?.dailyTurns ?? 100)) throw new ApiError(429, 'CHAT_DAILY_LIMIT', 'Daily chat limit reached');
    await tx.chatUsage.update({ where: { accountId_day: { accountId: identity.accountId, day } }, data: { turns: { increment: 1 } } });
  }
  async submit(identity: Identity, key: string, input: unknown) {
    const body = object(input, ['surface'], ['text', 'imageIds', 'imageIntent']);
    const imageIds = body.imageIds ?? [];
    if (!Array.isArray(imageIds) || imageIds.length > 4 || imageIds.some(id => typeof id !== 'string') || (body.imageIntent !== undefined && typeof body.imageIntent !== 'boolean')) throw new ApiError(400, 'INVALID_INPUT', 'Invalid image attachments');
    const text = imageIds.length && (body.text === '' || body.text === undefined) ? '看看这张图片。' : chatText(body.text);
    if (!['interior', 'courtyard'].includes(String(body.surface))) throw new ApiError(400, 'INVALID_INPUT', 'Invalid surface');
    if (!this.agent) throw new ApiError(503, 'CHAT_NOT_CONFIGURED', 'Chat is not configured');
    return this.game.mutate(identity, key, 'chat.send', { text, surface: body.surface, ...(imageIds.length ? { imageIds } : {}), ...(body.imageIntent ? { imageIntent: true } : {}) }, async tx => {
      const room = await this.room(identity, tx);
      if (await tx.chatTurn.findFirst({ where: { petId: room.petId, status: { in: active } } })) throw new ApiError(409, 'CHAT_BUSY', 'Wait for the current reply');
      await this.reserve(tx, identity);
      const turn = await tx.chatTurn.create({ data: { petId: room.petId, sessionId: identity.sessionId, epoch: room.epoch, userText: text, surface: String(body.surface), imageRoll: randomInt(100), imageIntent: body.imageIntent === true } });
      if (imageIds.length) {
        if (!this.images) throw new ApiError(503, 'IMAGES_NOT_CONFIGURED', 'Images are not configured');
        await this.images.bind(tx, identity, turn.id, imageIds as string[]);
      }
      return { status: 202, body: { id: turn.id } };
    });
  }
  async control(identity: Identity, key: string, id: string, action: 'stop' | 'retry' | 'delete') {
    const result = await this.game.mutate(identity, key, 'chat.' + action, { id }, async tx => {
      const turn = await this.owned(identity, id, tx), room = await this.room(identity, tx);
      await tx.$queryRaw`SELECT "petId" FROM "ChatRoom" WHERE "petId"=${room.petId}::uuid FOR UPDATE`;
      if (action === 'retry') {
        if (!this.agent) throw new ApiError(503, 'CHAT_NOT_CONFIGURED', 'Chat is not configured');
        if (turn.status !== 'failed') throw new ApiError(409, 'CHAT_NOT_RETRYABLE', 'Only failed replies may be retried');
        if (turn.epoch !== room.epoch) throw new ApiError(409, 'CHAT_CONTEXT_CHANGED', 'Send a new message after memory changes');
        if (await tx.chatTurn.findFirst({ where: { petId: turn.petId, status: { in: active } } })) throw new ApiError(409, 'CHAT_BUSY', 'Wait for the current reply');
        await this.reserve(tx, identity);
        await tx.chatTurn.update({ where: { id }, data: { status: 'queued', reply: '', error: null, sessionId: identity.sessionId, attempt: { increment: 1 } } });
      } else if (action === 'stop') {
        if (active.includes(turn.status)) await tx.chatTurn.update({ where: { id }, data: { status: 'cancelled', error: 'CHAT_CANCELLED' } });
        await tx.imageJob.updateMany({ where: { turnId: id, status: { in: ['proposed', 'queued', 'submitted', 'saving'] } }, data: { status: 'cancelled', resultUrl: null } });
      } else {
        await this.images?.cancelContext(tx, room.petId, id);
        await tx.chatTurn.update({ where: { id }, data: { hidden: true, userText: '', reply: '', invitation: Prisma.DbNull, status: 'cancelled' } });
        await tx.chatEvent.deleteMany({ where: { turnId: id } });
        await tx.memoryTask.deleteMany({ where: { turnId: id } });
        await tx.longMemory.updateMany({ where: { petId: room.petId, sourceTurnId: id }, data: { sourceTurnId: null } });
        await this.changeContext(tx, room.petId, room.epoch);
      }
      return { status: 200, body: { id } };
    });
    if (action !== 'retry') { this.running.get(id)?.abort.abort(); if (action === 'delete') await this.abortObsolete(); }
    return result;
  }
  private async changeContext(tx: Transaction, petId: string, epoch: number) {
    await this.images?.cancelContext(tx, petId);
    await tx.chatRoom.update({ where: { petId }, data: { epoch: { increment: 1 }, needsReindex: true } });
    await tx.memoryGarbage.upsert({ where: { scope: `${petId}:${epoch}` }, create: { scope: `${petId}:${epoch}` }, update: {} });
    await tx.chatTurn.updateMany({ where: { petId, status: { in: active } }, data: { status: 'cancelled', reply: '', error: 'CHAT_CONTEXT_CHANGED' } });
  }
  private async abortObsolete() {
    for (const [id, run] of this.running) {
      const turn = await this.game.db.chatTurn.findUnique({ where: { id } });
      if (!turn || turn.status !== 'running') run.abort.abort();
    }
  }
  async memories(identity: Identity): Promise<PetMemories> {
    const room = await this.room(identity);
    const entries = await this.game.db.longMemory.findMany({ where: { petId: room.petId, active: true }, orderBy: { updatedAt: 'desc' } });
    const pending = await this.game.db.memoryTask.count({ where: { turn: { petId: room.petId }, epoch: room.epoch } });
    return { items: entries.map(m => ({ id: m.id, text: m.text, sourceTurnId: m.sourceTurnId, updatedAt: m.updatedAt.toISOString() })), status: !this.config.memory ? 'unavailable' : room.needsReindex || pending ? 'pending' : 'ready' };
  }
  async manageMemory(identity: Identity, key: string, action: 'update' | 'delete' | 'clear', id?: string, text?: string) {
    if (action === 'update' && !mayRemember(chatText(text, 1000), true)) throw new ApiError(400, 'MEMORY_NOT_ALLOWED', 'Credentials and excluded content cannot be stored as memory');
    const result = await this.game.mutate(identity, key, 'memory.' + action, { id: id ?? null, text: text ?? null }, async tx => {
      const room = await this.room(identity, tx);
      await tx.$queryRaw`SELECT "petId" FROM "ChatRoom" WHERE "petId"=${room.petId}::uuid FOR UPDATE`;
      if (action !== 'clear' && !await tx.longMemory.findFirst({ where: { id, petId: room.petId, active: true } })) throw new ApiError(404, 'MEMORY_NOT_FOUND', 'Memory was not found');
      if (action === 'update') await tx.longMemory.update({ where: { id }, data: { text: chatText(text, 1000), sourceTurnId: null, updatedAt: await databaseNow(tx) } });
      else await tx.longMemory.updateMany({ where: { petId: room.petId, ...(id ? { id } : {}) }, data: { active: false, text: '', sourceTurnId: null, providerId: null } });
      await this.changeContext(tx, room.petId, room.epoch);
      return { status: 200, body: { changed: true } };
    });
    await this.abortObsolete(); return result;
  }
  private async guard(tx: Transaction, original: ChatTurn) {
    await tx.$queryRaw`SELECT "petId" FROM "ChatRoom" WHERE "petId"=${original.petId}::uuid FOR UPDATE`;
    const current = await tx.chatTurn.findUniqueOrThrow({ where: { id: original.id }, include: { room: true } });
    if (current.hidden || current.status !== 'running' || current.attempt !== original.attempt || current.room.epoch !== original.epoch) throw new Error('CHAT_CONTEXT_CHANGED');
    const session = await tx.session.findFirst({ where: { id: current.sessionId, OR: [{ expiresAt: null }, { expiresAt: { gt: await databaseNow(tx) } }] } });
    if (!session) throw new Error('CHAT_SESSION_EXPIRED');
    return current;
  }
  private async emit(original: ChatTurn, type: 'text' | 'status' | 'memory', data: Record<string, unknown>, update: Prisma.ChatTurnUpdateInput = {}) {
    await this.game.db.$transaction(async tx => {
      const current = await this.guard(tx, original);
      if (type === 'text' && current.reply === data.text) return;
      await tx.chatTurn.update({ where: { id: original.id }, data: update });
      await tx.chatEvent.create({ data: { turnId: original.id, type, data: json(data) } });
    });
  }
  private async facts(identity: Identity) {
    const snapshot = await this.game.snapshot(identity), life = await this.cats.view(identity);
    // Recent simulation records stay in CatLife, but must not reintroduce forgotten experiences into chat.
    return { owner: { name: snapshot.player.username }, pet: snapshot.pet, activeTrip: snapshot.activeTrip, life: { ...life, memories: [] } };
  }
  private async tool(turn: ChatTurn, identity: Identity, name: string, args: unknown) {
    if (['generate_image', 'propose_image', 'gift_image'].includes(name)) {
      if (!this.images) throw new ApiError(503, 'IMAGE_GENERATION_NOT_CONFIGURED', 'Image generation is not configured');
      return this.game.db.$transaction(async tx => { await this.guard(tx, turn); return this.images!.fromTool(tx, turn, identity.accountId, name, args); });
    }
    await this.game.db.$transaction(tx => this.guard(tx, turn));
    if (name === 'get_pet_state') { object(args, []); return this.facts(identity); }
    if (name !== 'invite_pet') throw new ApiError(400, 'TOOL_NOT_ALLOWED', 'Unknown pet tool');
    const input = object(args, ['activity']);
    if (!PET_ACTIVITIES.includes(input.activity as CatActivity)) throw new ApiError(400, 'INVALID_INPUT', 'Invalid pet activity');
    const prior = await this.owned(identity, turn.id);
    if (prior.invitation) return prior.invitation;
    const life = await this.cats.view(identity);
    const activity = input.activity as CatActivity;
    try {
      await this.cats.advance(identity, `chat-${turn.id}`, { protocolVersion: 2, surface: turn.surface as CatSurface, event: 'invite', automatic: life.automatic, intentId: null, expectedRevision: life.revision, target: life.cushion, invitedActivity: activity }, {
        guard: async tx => { const current = await this.guard(tx, turn); if (current.invitation) throw new Error('INVITATION_ALREADY_RECORDED'); },
        committed: async (tx, next, home, changed) => {
          const outcome = !home ? 'unavailable' : !changed || next.decisionSource === 'continuity' ? 'deferred' : next.intent?.activity === activity ? 'accepted' : 'declined';
          const invitation: PetInvitation = { activity, outcome, stage: 'requested', intentId: outcome === 'accepted' ? next.intent!.id : null, life: next };
          await tx.chatTurn.update({ where: { id: turn.id }, data: { invitation: json(invitation) } });
          await tx.chatEvent.create({ data: { turnId: turn.id, type: 'tool', data: json({ invitation }) } });
        },
      });
    } catch (error) { if (!(await this.owned(identity, turn.id)).invitation) throw error; }
    return (await this.owned(identity, turn.id)).invitation;
  }
  private async run(turn: ChatTurn, identity: Identity, abort: AbortController) {
    const timeout = setTimeout(() => abort.abort(), 120000);
    try {
      let memories: string[] = [], memoryStatus: 'ready' | 'unavailable' = 'unavailable';
      const room = await this.game.db.chatRoom.findUniqueOrThrow({ where: { petId: turn.petId } });
      if (this.config.memory && !room.needsReindex) {
        try {
          const matches = await this.memory.search(`${turn.petId}:${turn.epoch}`, turn.userText);
          const entries = await this.game.db.longMemory.findMany({ where: { petId: turn.petId, active: true, providerId: { in: matches.map(m => m.id) } } });
          memories = entries.slice(0, 5).map(m => m.text); memoryStatus = 'ready';
        } catch { /* Chat remains usable while memory storage is offline. */ }
      }
      await this.emit(turn, 'memory', { status: memoryStatus }, { memoryStatus });
      const history = await this.game.db.chatTurn.findMany({ where: { petId: turn.petId, epoch: turn.epoch, hidden: false, status: 'completed', id: { not: turn.id } }, orderBy: { createdAt: 'desc' }, take: 10 });
      const pictures = await this.images?.context([turn, ...history], identity.accountId) ?? [];
      const prompt = JSON.stringify({ history: history.reverse().map(t => {
        const invitation = t.invitation as unknown as PetInvitation | null;
        return { user: t.userText, assistant: t.reply, ...(invitation ? { invitation: { activity: invitation.activity, outcome: invitation.outcome, stage: invitation.stage } } : {}) };
      }), memories, facts: await this.facts(identity), user: turn.userText, turnId: turn.id,
        images: pictures.map(({ path: _path, ...picture }, index) => ({ ...picture, index: index + 1 })),
        imageCapabilities: { enabled: this.images?.enabled ?? false, explicitRequest: turn.imageIntent, giftEligible: !!this.images?.enabled && !pictures.some(p => p.turnId === turn.id && p.kind === 'upload') && turn.imageRoll < 5 && giftTopic(turn.userText) } });
      await this.game.db.$transaction(tx => this.guard(tx, turn));
      if (abort.signal.aborted) throw new Error('CHAT_CANCELLED');
      await this.agent!.run({ prompt, images: pictures.map(p => p.path), signal: abort.signal, tool: (name, args) => this.tool(turn, identity, name, args), text: text => this.emit(turn, 'text', { text }, { reply: text }), progress: (tool, status) => this.emit(turn, 'status', { tool, status }) });
      await this.game.db.$transaction(async tx => {
        await this.guard(tx, turn);
        await tx.chatTurn.update({ where: { id: turn.id }, data: { status: 'completed', memoryStatus: this.config.memory ? 'pending' : 'unavailable' } });
        if (this.config.memory) await tx.memoryTask.upsert({ where: { turnId: turn.id }, create: { turnId: turn.id, epoch: turn.epoch }, update: { generation: { increment: 1 } } });
        await tx.chatEvent.create({ data: { turnId: turn.id, type: 'status', data: { status: 'completed' } } });
      });
    } catch {
      await this.game.db.chatTurn.updateMany({ where: { id: turn.id, attempt: turn.attempt, status: 'running' }, data: { status: 'failed', error: abort.signal.aborted ? 'CHAT_TIMEOUT' : 'CHAT_GENERATION_FAILED' } }).catch(() => {});
    } finally { clearTimeout(timeout); }
  }
  async tick() {
    if (this.ticking || this.stopped) return;
    this.ticking = true;
    try {
      // A process restart never replays a possibly executed tool automatically.
      await this.game.db.chatTurn.updateMany({ where: { status: { in: active }, updatedAt: { lt: new Date(Date.now() - 130000) }, id: { notIn: [...this.running.keys()] } }, data: { status: 'failed', error: 'CHAT_INTERRUPTED' } });
      if (this.agent && this.running.size < 4) {
        const pending = await this.game.db.chatTurn.findMany({ where: { status: 'queued' }, orderBy: { createdAt: 'asc' }, take: 4 - this.running.size, include: { room: { include: { pet: { include: { player: true } } } } } });
        for (const turn of pending) {
          const claimed = await this.game.db.chatTurn.updateMany({ where: { id: turn.id, status: 'queued' }, data: { status: 'running' } });
          if (!claimed.count) continue;
          const abort = new AbortController();
          const done = this.run(turn, { accountId: turn.room.pet.player.accountId, sessionId: turn.sessionId }, abort).finally(() => this.running.delete(turn.id));
          this.running.set(turn.id, { abort, done });
        }
      }
      if (!this.memoryBusy && this.config.memory) { this.memoryBusy = true; void this.workMemory().catch(() => {}).finally(() => { this.memoryBusy = false; }); }
    } catch { /* Readiness reports unavailable databases/migrations; the worker retries later. */ }
    finally { this.ticking = false; }
  }
  private async syncMemories(petId: string, epoch: number, entries: StoredMemory[], rebuilt = false) {
    // A malformed or truncated provider snapshot must never erase canonical memories.
    if (!Array.isArray(entries) || entries.length >= 10000 || new Set(entries.map(i => i?.id)).size !== entries.length || entries.some(i => !i || typeof i.id !== 'string' || !i.id || typeof i.memory !== 'string' || !i.memory.trim() || i.memory.length > 1000)) throw new Error('MEMORY_INVALID_SNAPSHOT');
    return this.game.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "petId" FROM "ChatRoom" WHERE "petId"=${petId}::uuid FOR UPDATE`;
      const room = await tx.chatRoom.findUniqueOrThrow({ where: { petId } }); if (room.epoch !== epoch) return false;
      const existing = await tx.longMemory.findMany({ where: { petId, active: true } });
      const kept: string[] = [];
      for (const item of entries) {
        const old = existing.find(m => m.providerId === item.id || m.id === item.metadata?.entryId);
        const source = item.metadata?.sourceTurnId;
        const sourceTurnId = typeof source === 'string' && /^[a-f0-9-]{36}$/.test(source) && await tx.chatTurn.findFirst({ where: { id: source, petId, hidden: false } }) ? source : old?.sourceTurnId ?? null;
        const data = { text: item.memory, providerId: item.id, sourceTurnId, updatedAt: old?.text === item.memory ? old.updatedAt : await databaseNow(tx) };
        const row = old ? await tx.longMemory.update({ where: { id: old.id }, data }) : await tx.longMemory.create({ data: { petId, ...data } });
        kept.push(row.id);
      }
      await tx.longMemory.updateMany({ where: { petId, active: true, id: { notIn: kept } }, data: { active: false, text: '', providerId: null, sourceTurnId: null } });
      if (rebuilt) await tx.chatRoom.update({ where: { petId }, data: { needsReindex: false } });
      return true;
    }, { timeout: 10000 });
  }
  private async workMemory() {
    const db = this.game.db;
    const room = await db.chatRoom.findFirst({ where: { needsReindex: true } });
    if (room) {
      const entries = await db.longMemory.findMany({ where: { petId: room.petId, active: true } });
      const result = await this.memory.rebuild(`${room.petId}:${room.epoch}`, entries);
      await this.syncMemories(room.petId, room.epoch, result, true); return;
    }
    const garbage = await db.memoryGarbage.findFirst({ orderBy: { createdAt: 'asc' } });
    if (garbage) { await this.memory.purge(garbage.scope); await db.memoryGarbage.delete({ where: { scope: garbage.scope } }); return; }
    const task = await db.memoryTask.findFirst({ where: { nextAt: { lte: new Date() } }, orderBy: { nextAt: 'asc' }, include: { turn: { include: { room: true } } } });
    if (!task) return;
    const taskVersion = { turnId: task.turnId, generation: task.generation };
    if (task.epoch !== task.turn.room.epoch || task.turn.hidden || task.turn.status !== 'completed') { await db.memoryTask.deleteMany({ where: taskVersion }); return; }
    try {
      const invitation = task.turn.invitation as unknown as PetInvitation | null;
      const experience = invitation?.stage === 'completed' ? invitation.life?.memories[0]?.text : undefined;
      const hasImages = await db.mediaAsset.count({ where: { turnId: task.turnId, kind: 'upload' } });
      // Image captions and visual inferences never enter the text memory extractor.
      const text = (hasImages ? '' : task.turn.userText) + (experience ? `\n应用确认的共同经历：${experience}` : '');
      if (!text.trim()) {
        await db.$transaction(async tx => {
          const removed = await tx.memoryTask.deleteMany({ where: taskVersion });
          if (removed.count) await tx.chatTurn.updateMany({ where: { id: task.turnId, hidden: false, room: { epoch: task.epoch } }, data: { memoryStatus: 'ready' } });
        }); return;
      }
      const result = await this.memory.extract(`${task.turn.petId}:${task.epoch}`, text, task.turnId);
      const accepted = await this.syncMemories(task.turn.petId, task.epoch, result);
      await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "ChatTurn" WHERE "id"=${task.turnId}::uuid FOR UPDATE`;
        const removed = await tx.memoryTask.deleteMany({ where: taskVersion });
        if (accepted && removed.count) await tx.chatTurn.updateMany({ where: { id: task.turnId, hidden: false, room: { epoch: task.epoch } }, data: { memoryStatus: 'ready' } });
      });
    } catch {
      await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT "id" FROM "ChatTurn" WHERE "id"=${task.turnId}::uuid FOR UPDATE`;
        const changed = await tx.memoryTask.updateMany({ where: taskVersion, data: { attempts: { increment: 1 }, nextAt: new Date(Date.now() + Math.min(300000, 5000 * 2 ** Math.min(task.attempts, 6))) } });
        if (changed.count) await tx.chatTurn.updateMany({ where: { id: task.turnId, hidden: false, room: { epoch: task.epoch } }, data: { memoryStatus: 'unavailable' } });
      });
    }
  }
}
