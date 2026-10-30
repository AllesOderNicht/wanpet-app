import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { CatLifeRequest, CatLifeView, PetInvitation, PetCareRequest, PetCareResult, PetProfileRequest, PetProfileView } from '@wanpet/contracts' with { 'resolution-mode': 'import' };
import { advanceCat, applyCare, catOptions, catView, chooseCat, initialCat, interruptCatIntent, migrateCat, type CatState } from './cat-life';
import { databaseNow, type Transaction } from './database';
import { ApiError } from './errors';
import { JevDecisions, type PetDecisionContext } from './jev';
import { GameService, type Identity } from './service';
import { defaultPetProfile, profileContext } from './pet-profile';

@Injectable()
export class CatLifeService {
  constructor(@Inject(GameService) private game: GameService, @Inject(JevDecisions) private jev: JevDecisions) {}
  private async load(db: Transaction, identity: Identity) {
    const pet = await db.pet.findFirst({ where: { player: { accountId: identity.accountId } }, include: {
      life: true, profile: true, player: { include: { trips: { orderBy: { startedAt: 'desc' }, take: 1 } } },
    } });
    if (!pet) throw new ApiError(409, 'PLAYER_NOT_INITIALIZED', 'Initialize your save first');
    const now = (await databaseNow(db)).getTime();
    const trip = pet.player.trips[0];
    const atHomeSince = trip ? trip.returnAt.getTime() : 0;
    const state = pet.life ? migrateCat(pet.life.state, pet.id, now) : initialCat(pet.id, now);
    const profile: PetProfileView = pet.profile ? { petId: pet.id, nickname: pet.nickname, speciesId: pet.speciesId, revision: pet.profile.revision, description: pet.profile.description,
      voice: pet.profile.voice as PetProfileView['voice'], temperament: pet.profile.temperament as unknown as PetProfileView['temperament'], updatedAt: pet.profile.updatedAt.toISOString() } : defaultPetProfile(pet, state.temperament, now);
    state.temperament = { ...profile.temperament };
    return { pet, profile, state, revision: pet.life?.revision ?? 0, now, atHomeSince, home: now >= atHomeSince };
  }
  private viewOf(current: Awaited<ReturnType<CatLifeService['load']>>, state = current.state, revision = current.revision): CatLifeView {
    return { ...catView(current.pet.id, revision, state, current.now), profile: current.profile };
  }
  async view(identity: Identity) {
    const current = await this.load(this.game.db, identity);
    return this.viewOf(current);
  }
  async profile(identity: Identity) { return (await this.load(this.game.db, identity)).profile; }
  async updateProfile(identity: Identity, key: string, input: PetProfileRequest) {
    return this.game.mutate<PetProfileView>(identity, key, 'pet.profile', input, async tx => {
      const current = await this.load(tx, identity);
      if (input.expectedRevision !== current.profile.revision) throw new ApiError(409, 'REVISION_CONFLICT', 'Refresh the pet profile');
      const data = { revision: current.profile.revision + 1, description: input.description, voice: input.voice, temperament: input.temperament, updatedAt: new Date(current.now) };
      await tx.petProfile.upsert({ where: { petId: current.pet.id }, create: { petId: current.pet.id, ...data }, update: data });
      await tx.pet.update({ where: { id: current.pet.id }, data: { nickname: input.nickname } });
      await tx.player.update({ where: { id: current.pet.playerId }, data: { revision: { increment: 1 } } });
      // Existing replies used the old profile. Guard rejects their late text/tool writes.
      const room = await tx.chatRoom.findUnique({ where: { petId: current.pet.id } });
      if (room) {
        await tx.$queryRaw`SELECT "petId" FROM "ChatRoom" WHERE "petId"=${current.pet.id}::uuid FOR UPDATE`;
        await tx.chatTurn.updateMany({ where: { petId: current.pet.id, status: { in: ['queued', 'running'] } }, data: { status: 'cancelled', reply: '', error: 'CHAT_CONTEXT_CHANGED' } });
      }
      return { status: 200, body: { ...current.profile, ...data, nickname: input.nickname, petId: current.pet.id, updatedAt: new Date(current.now).toISOString() } };
    });
  }
  async care(identity: Identity, key: string, input: PetCareRequest) {
    return this.game.mutate<PetCareResult>(identity, key, 'pet.care', input, async tx => {
      const current = await this.load(tx, identity);
      if (current.revision !== input.expectedRevision) throw new ApiError(409, 'REVISION_CONFLICT', 'Refresh pet care state');
      const next = applyCare(current.state, input);
      if (input.operation === 'feed' && input.source === 'inventory') {
        const used = await tx.inventory.updateMany({ where: { playerId: current.pet.playerId, itemId: 'test_food', quantity: { gte: 1 } }, data: { quantity: { decrement: 1 } } });
        if (used.count !== 1) throw new ApiError(409, 'INSUFFICIENT_INVENTORY', 'No stored food remains');
        await tx.player.update({ where: { id: current.pet.playerId }, data: { revision: { increment: 1 } } });
      }
      const revision = current.revision + 1;
      await tx.petLife.upsert({ where: { petId: current.pet.id }, create: { petId: current.pet.id, revision, state: next as unknown as Prisma.InputJsonValue, updatedAt: new Date(current.now) }, update: { revision, state: next as unknown as Prisma.InputJsonValue, updatedAt: new Date(current.now) } });
      return { status: 200, body: { life: this.viewOf(current, next, revision), snapshot: await this.game.snapshotIn(tx, identity.accountId) } };
    });
  }
  private async decisionContext(current: Awaited<ReturnType<CatLifeService['load']>>): Promise<PetDecisionContext> {
    const room = await this.game.db.chatRoom.findUnique({ where: { petId: current.pet.id } });
    const entries = await this.game.db.longMemory.findMany({ where: { petId: current.pet.id, active: true }, orderBy: { updatedAt: 'desc' }, take: 40 });
    // Only pet-life-relevant canonical facts are sent to the behavior model; no chat transcript.
    const memories = entries.filter(m => /窗边|阳光|安静|抚摸|绘本|看书|玩具|陪伴|小猫|宠物|window|quiet|pet|book/i.test(m.text)).slice(0, 5).map(m => m.text.slice(0, 500));
    return { epoch: room?.epoch ?? 0, profileRevision: current.profile.revision, profile: profileContext(current.profile), memories };
  }
  async advance(identity: Identity, key: string, input: CatLifeRequest, hooks?: {
    guard(tx: Transaction): Promise<void>;
    committed(tx: Transaction, view: CatLifeView, atHome: boolean, changed: boolean): Promise<void>;
  }) {
    const preview = await this.load(this.game.db, identity);
    const context = await this.decisionContext(preview);
    const replay = await this.game.db.idempotencyRecord.findUnique({ where: { accountId_operation_key: { accountId: identity.accountId, operation: 'pet.life', key } } });
    let selection: string | undefined;
    if (!replay && preview.home && input.expectedRevision === preview.revision) {
      const next = advanceCat(preview.state, input, preview.now, preview.atHomeSince);
      const options = catOptions(next, input, preview.now);
      // The network call holds no database/account lock. A newer save wins below.
      selection = await this.jev.decide(preview.pet.id, preview.revision, next, input.event, options, preview.now, context);
    }
    return this.game.mutate<CatLifeView>(identity, key, 'pet.life', input, async tx => {
      await hooks?.guard(tx);
      const current = await this.load(tx, identity);
      const room = await tx.chatRoom.findUnique({ where: { petId: current.pet.id } });
      if (room) await tx.$queryRaw`SELECT "petId" FROM "ChatRoom" WHERE "petId"=${current.pet.id}::uuid FOR UPDATE`;
      const epoch = (await tx.chatRoom.findUnique({ where: { petId: current.pet.id } }))?.epoch ?? 0;
      if (epoch !== context.epoch || current.profile.revision !== context.profileRevision) selection = undefined;
      if (current.revision !== input.expectedRevision) {
        const view = this.viewOf(current);
        await hooks?.committed(tx, view, current.home, false);
        return { status: 200, body: view };
      }
      const next = current.home ? advanceCat(current.state, input, current.now, current.atHomeSince) : structuredClone(current.state);
      if (!current.home) { interruptCatIntent(next, current.now); next.decisionSource = 'continuity'; }
      else chooseCat(next, input, current.now, preview.revision === current.revision ? selection : undefined);
      const revision = current.revision + 1;
      next.updatedAt = current.now;
      await tx.petLife.upsert({ where: { petId: current.pet.id }, create: { petId: current.pet.id, revision, state: next as unknown as Prisma.InputJsonValue, updatedAt: new Date(current.now) },
        update: { revision, state: next as unknown as Prisma.InputJsonValue, updatedAt: new Date(current.now) } });
      const view = this.viewOf(current, next, revision);
      await hooks?.committed(tx, view, current.home, true);
      if (current.home && current.state.intent?.id === input.intentId && ['started', 'complete', 'blocked'].includes(input.event)) {
        const completed = input.event === 'complete' && next.memories[0]?.id !== current.state.memories[0]?.id;
        if (input.event !== 'complete' || completed) {
          const turns = await tx.chatTurn.findMany({ where: { petId: current.pet.id, hidden: false, invitation: { path: ['intentId'], equals: input.intentId } } });
          for (const turn of turns) {
            const invitation = { ...(turn.invitation as unknown as PetInvitation), stage: input.event === 'started' ? 'started' : completed ? 'completed' : 'blocked', life: view };
            await tx.chatTurn.update({ where: { id: turn.id }, data: { invitation: invitation as unknown as Prisma.InputJsonValue } });
            await tx.chatEvent.create({ data: { turnId: turn.id, type: 'tool', data: { invitation } as unknown as Prisma.InputJsonValue } });
            if (completed && (turn.memoryStatus !== 'unavailable' || await tx.memoryTask.findUnique({ where: { turnId: turn.id } }))) {
              await tx.memoryTask.upsert({ where: { turnId: turn.id }, create: { turnId: turn.id, epoch: turn.epoch }, update: { generation: { increment: 1 }, nextAt: new Date(current.now) } });
              await tx.chatTurn.update({ where: { id: turn.id }, data: { memoryStatus: 'pending' } });
            }
          }
        }
      }
      // A room change, trip or new decision can supersede an accepted invitation before completion.
      if (current.state.intent && current.state.intent.id !== next.intent?.id) {
        const superseded = await tx.chatTurn.findMany({ where: { petId: current.pet.id, hidden: false, invitation: { path: ['intentId'], equals: current.state.intent.id } } });
        for (const turn of superseded) {
          const previous = turn.invitation as unknown as PetInvitation;
          if (!['requested', 'started'].includes(previous.stage)) continue;
          const invitation = { ...previous, stage: 'blocked', life: view };
          await tx.chatTurn.update({ where: { id: turn.id }, data: { invitation: invitation as unknown as Prisma.InputJsonValue } });
          await tx.chatEvent.create({ data: { turnId: turn.id, type: 'tool', data: { invitation } as unknown as Prisma.InputJsonValue } });
        }
      }
      return { status: 200, body: view };
    });
  }
}
