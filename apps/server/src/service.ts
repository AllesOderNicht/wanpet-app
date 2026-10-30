import { Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthResponse, SessionResponse, ClaimTripResponse, PlayerSnapshot, StartTripRequest, StartTripResponse } from '@wanpet/contracts' with { 'resolution-mode': 'import' };
import { Database, databaseNow, MIGRATIONS, Transaction } from './database';
import { ApiError } from './errors';
import { digest, Passwords, token } from './security';
import { rollTripRewards, storedRewards, TEST_TRIP, tripView } from './travel';
import { planPostcard } from './postcard-images';
import type { Config } from './config';

const STARTER = { version: 'starter-v1', speciesId: 'test_species', nickname: '测试宠物', items: [{ itemId: 'test_food', quantity: 3 }, { itemId: 'test_supply', quantity: 1 }] };
const unauthorized = () => new ApiError(401, 'UNAUTHENTICATED', 'Authentication required');
const invalidCredentials = () => new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
export interface Identity { accountId: string; sessionId: string }
@Injectable()
export class GameService {
  readonly passwords = new Passwords();
  constructor(@Inject(Database) readonly db: Database, @Optional() @Inject('WANPET_CONFIG') private config?: Config) {}

  async register(email: string, name: string, secret: string): Promise<AuthResponse> {
    const passwordHash = await this.passwords.hash(secret);
    try {
      return await this.db.$transaction(async tx => {
        const account = await tx.account.create({ data: { email, username: name, passwordHash } });
        return this.session(tx, account);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ApiError(409, 'EMAIL_TAKEN', 'Email is already registered');
      throw error;
    }
  }
  private async lock(tx: Transaction, accountId: string) {
    await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${accountId}::uuid FOR UPDATE`;
  }
  private async session(tx: Transaction, account: { id: string; email: string | null; username: string }): Promise<AuthResponse> {
    if (!account.email) throw invalidCredentials();
    const accessToken = token();
    const now = await databaseNow(tx);
    await tx.session.deleteMany({ where: { accountId: account.id, expiresAt: { lte: now } } });
    await tx.session.create({ data: { accountId: account.id, tokenHash: digest(accessToken), expiresAt: null } });
    return { account: { id: account.id, email: account.email, username: account.username }, accessToken, expiresAt: null };
  }
  async login(email: string, secret: string): Promise<AuthResponse> {
    const account = await this.db.account.findUnique({ where: { email } });
    const valid = await this.passwords.verify(secret, account?.passwordHash ?? await this.passwords.dummy);
    if (!account || !valid) throw invalidCredentials();
    return this.db.$transaction(async tx => {
      await this.lock(tx, account.id);
      const fresh = await tx.account.findUniqueOrThrow({ where: { id: account.id } });
      if (fresh.passwordHash !== account.passwordHash) throw invalidCredentials();
      return this.session(tx, fresh);
    });
  }
  async authenticate(header: unknown): Promise<Identity> {
    if (typeof header !== 'string' || !/^Bearer [A-Za-z0-9_-]{43}$/.test(header)) throw unauthorized();
    const found = await this.db.session.findUnique({ where: { tokenHash: digest(header.slice(7)) } });
    if (!found || (found.expiresAt && found.expiresAt <= await databaseNow(this.db))) throw unauthorized();
    return { accountId: found.accountId, sessionId: found.id };
  }
  private async validateSession(tx: Transaction, identity: Identity) {
    const found = await tx.session.findFirst({ where: { id: identity.sessionId, accountId: identity.accountId, OR: [{ expiresAt: null }, { expiresAt: { gt: await databaseNow(tx) } }] } });
    if (!found) throw unauthorized();
  }
  async currentSession(identity: Identity): Promise<SessionResponse> {
    return this.db.$transaction(async tx => {
      await this.validateSession(tx, identity);
      const account = await tx.account.findUniqueOrThrow({ where: { id: identity.accountId } });
      const session = await tx.session.findUniqueOrThrow({ where: { id: identity.sessionId } });
      if (!account.email) throw unauthorized();
      return { account: { id: account.id, email: account.email, username: account.username }, expiresAt: session.expiresAt?.toISOString() ?? null };
    });
  }
  async logout(identity: Identity) {
    await this.db.$transaction(async tx => {
      await this.lock(tx, identity.accountId);
      await this.validateSession(tx, identity);
      await tx.session.delete({ where: { id: identity.sessionId } });
    });
  }
  async changePassword(identity: Identity, current: string, next: string) {
    const account = await this.db.account.findUniqueOrThrow({ where: { id: identity.accountId } });
    if (!await this.passwords.verify(current, account.passwordHash)) throw invalidCredentials();
    const passwordHash = await this.passwords.hash(next);
    await this.db.$transaction(async tx => {
      await this.lock(tx, identity.accountId);
      await this.validateSession(tx, identity);
      const fresh = await tx.account.findUniqueOrThrow({ where: { id: identity.accountId } });
      if (fresh.passwordHash !== account.passwordHash) throw invalidCredentials();
      await tx.account.update({ where: { id: account.id }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { accountId: account.id } });
    });
  }
  async snapshotIn(tx: Transaction, accountId: string, claimingTripId?: string): Promise<PlayerSnapshot> {
    const player = await tx.player.findUnique({ where: { accountId }, include: {
      account: { select: { username: true } }, pet: true, inventory: { orderBy: { itemId: 'asc' } }, grant: true,
      trips: { where: { claimedAt: null, ...(claimingTripId ? { id: { not: claimingTripId } } : {}) }, take: 1 },
      collection: { orderBy: { itemId: 'asc' } },
    } });
    if (!player) throw new ApiError(409, 'PLAYER_NOT_INITIALIZED', 'Initialize your save first');
    if (!player.pet || !player.grant) throw new Error('Incomplete player save');
    const now = await databaseNow(tx), activeTrip = player.trips[0] ? tripView(player.trips[0], now) : null;
    return {
      player: { id: player.id, accountId, username: player.account.username }, revision: player.revision, serverNow: now.toISOString(), configVersion: player.grant.configVersion,
      pet: { id: player.pet.id, speciesId: player.pet.speciesId, nickname: player.pet.nickname, status: activeTrip?.status === 'TRAVELING' ? 'TRAVELING' : 'AT_HOME' },
      inventory: player.inventory.map(({ itemId, quantity }) => ({ itemId, quantity })),
      collection: player.collection.map(({ itemId, quantity, firstCollectedAt }) => ({ itemId, quantity, firstCollectedAt: firstCollectedAt.toISOString() })), activeTrip,
    };
  }
  async snapshot(identity: Identity): Promise<PlayerSnapshot> {
    return this.db.$transaction(async tx => {
      await this.validateSession(tx, identity);
      return this.snapshotIn(tx, identity.accountId);
    }, { isolationLevel: 'RepeatableRead' });
  }
  async mutate<T>(identity: Identity, key: string, operation: string, input: unknown, execute: (tx: Transaction) => Promise<{ status: number; body: T }>) {
    return this.db.$transaction(async tx => {
      await this.lock(tx, identity.accountId);
      await this.validateSession(tx, identity);
      const requestHash = digest(JSON.stringify(input));
      const scope = { accountId: identity.accountId, operation, key };
      const record = await tx.idempotencyRecord.findUnique({ where: { accountId_operation_key: scope } });
      if (record) {
        if (record.requestHash !== requestHash) throw new ApiError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key was used for another request');
        return { status: record.status, body: record.response as unknown as T };
      }
      const result = await execute(tx);
      await tx.idempotencyRecord.create({ data: { ...scope, requestHash, status: result.status, response: result.body as Prisma.InputJsonValue } });
      return result;
    }, { maxWait: 20000, timeout: 10000 });
  }
  async initialize(identity: Identity, key: string): Promise<{ status: number; snapshot: PlayerSnapshot }> {
    const result = await this.mutate(identity, key, 'initialize', {}, async tx => {
      const existing = await tx.player.findUnique({ where: { accountId: identity.accountId } });
      if (!existing) {
        await tx.player.create({ data: {
          accountId: identity.accountId,
          pet: { create: { speciesId: STARTER.speciesId, nickname: STARTER.nickname } },
          inventory: { create: STARTER.items },
          grant: { create: { configVersion: STARTER.version, items: STARTER.items } },
        } });
      }
      return { status: existing ? 200 : 201, body: await this.snapshotIn(tx, identity.accountId) };
    });
    return { status: result.status, snapshot: result.body };
  }
  async startTrip(identity: Identity, key: string, input: StartTripRequest) {
    return this.mutate<StartTripResponse>(identity, key, 'trip.start', input, async tx => {
      const player = await tx.player.findUnique({ where: { accountId: identity.accountId } });
      if (!player) throw new ApiError(409, 'PLAYER_NOT_INITIALIZED', 'Initialize your save first');
      if (await tx.trip.findFirst({ where: { playerId: player.id, claimedAt: null } })) throw new ApiError(409, 'ACTIVE_TRIP_EXISTS', 'Claim the existing trip before starting another');
      if (input.expectedRevision !== player.revision) throw new ApiError(409, 'REVISION_CONFLICT', 'Refresh your save before preparing a trip');
      for (const itemId of input.loadoutItemIds) {
        const consumed = await tx.inventory.updateMany({ where: { playerId: player.id, itemId, quantity: { gte: 1 } }, data: { quantity: { decrement: 1 } } });
        if (consumed.count !== 1) throw new ApiError(409, 'INSUFFICIENT_INVENTORY', 'A selected item is unavailable');
      }
      const now = await databaseNow(tx);
      const trip = await tx.trip.create({ data: {
        playerId: player.id, configVersion: TEST_TRIP.version, destinationId: TEST_TRIP.destinationId,
        loadout: input.loadoutItemIds, rewards: rollTripRewards(), startedAt: now,
        returnAt: new Date(now.getTime() + TEST_TRIP.durationSeconds * 1000),
      } });
      await tx.tripLedger.create({ data: { tripId: trip.id, kind: 'DEPARTURE', items: input.loadoutItemIds.map(itemId => ({ itemId, quantity: -1 })) } });
      const pet = await tx.pet.findUniqueOrThrow({ where: { playerId: player.id } });
      await planPostcard(tx, { tripId: trip.id, accountId: identity.accountId, petId: pet.id, speciesId: pet.speciesId, destination: trip.destinationId, theme: storedRewards(trip.rewards).find(r => r.collectible)!.itemId }, undefined, !!this.config?.images);
      await tx.player.update({ where: { id: player.id }, data: { revision: { increment: 1 } } });
      return { status: 201, body: { trip: tripView(trip, now), snapshot: await this.snapshotIn(tx, identity.accountId) } };
    });
  }
  async claimTrip(identity: Identity, key: string, id: string) {
    return this.mutate<ClaimTripResponse>(identity, key, 'trip.claim', { tripId: id }, async tx => {
      const trip = await tx.trip.findFirst({ where: { id, player: { accountId: identity.accountId } } });
      if (!trip) throw new ApiError(404, 'TRIP_NOT_FOUND', 'Trip was not found');
      // A different retry key still returns the first committed result, including its frozen snapshot.
      if (trip.claimedAt) return { status: 200, body: trip.claimResponse as unknown as ClaimTripResponse };
      const now = await databaseNow(tx);
      if (now < trip.returnAt) throw new ApiError(409, 'TRIP_NOT_READY', 'The pet has not returned yet');
      const stored = storedRewards(trip.rewards);
      const rewards = stored.map(({ itemId, quantity }) => ({ itemId, quantity }));
      for (const reward of stored) {
        const key = { playerId: trip.playerId, itemId: reward.itemId };
        await tx.inventory.upsert({ where: { playerId_itemId: key }, create: { ...key, quantity: reward.quantity }, update: { quantity: { increment: reward.quantity } } });
        if (reward.collectible) await tx.collectionEntry.upsert({ where: { playerId_itemId: key }, create: { ...key, quantity: reward.quantity, firstCollectedAt: now }, update: { quantity: { increment: reward.quantity } } });
      }
      const ledger = await tx.tripLedger.create({ data: { tripId: trip.id, kind: 'CLAIM', items: rewards } });
      await tx.player.update({ where: { id: trip.playerId }, data: { revision: { increment: 1 } } });
      // Freeze the post-claim view inside the same transaction, then publish it with the trip state.
      const snapshot = await this.snapshotIn(tx, identity.accountId, trip.id);
      const body: ClaimTripResponse = { tripId: trip.id, ledgerEntryId: ledger.id, rewards, snapshot };
      await tx.trip.update({ where: { id: trip.id }, data: { claimedAt: now, claimResponse: body as unknown as Prisma.InputJsonValue } });
      return { status: 200, body };
    });
  }
  async ready() {
    try {
      await this.db.$queryRaw`SELECT 1`;
      const rows = await this.db.$queryRaw<Array<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }>>`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`;
      if (!MIGRATIONS.every(name => rows.some(r => r.migration_name === name && r.finished_at && !r.rolled_back_at)) || rows.some(r => !r.finished_at && !r.rolled_back_at)) throw new Error('Migrations pending');
      return { status: 'ready' };
    } catch { throw new ApiError(503, 'NOT_READY', 'Database or migrations are unavailable'); }
  }
}
