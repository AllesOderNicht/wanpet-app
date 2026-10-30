import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/bootstrap';
import { loadConfig } from '../src/config';
import { Database, databaseNow } from '../src/database';
import { GameService } from '../src/service';
import { TEST_TRIP } from '../src/travel';
import { digest } from '../src/security';

const url = process.env.TEST_DATABASE_URL;
if (!url || !/^wanpet_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname.slice(1))) throw new Error('TEST_DATABASE_URL must name an isolated wanpet_test database');

test('trip economy PostgreSQL and HTTP acceptance', async t => {
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: url, PORT: '0', CLIENT_ORIGIN: 'http://localhost:5173' });
  let app = await createApp(config); await app.listen(0, '127.0.0.1');
  let service = app.get(GameService), db = app.get(Database), base = await app.getUrl();
  const request = async (path: string, data?: unknown, token?: string, key?: string) => {
    const result = await fetch(`${base}/v1/${path}`, { method: data === undefined ? 'GET' : 'POST', headers: {
      ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { 'Idempotency-Key': key } : {}),
    }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    return { status: result.status, body: await result.json() as any };
  };
  const prefix = 'trip_' + randomUUID().replaceAll('-', '').slice(0, 12);
  const auth = await service.register((prefix) + "@example.test", prefix, 'trip test password 123');
  const identity = await service.authenticate(`Bearer ${auth.accessToken}`);
  const initial = (await service.initialize(identity, 'init')).snapshot;
  const input = { loadoutItemIds: ['test_food', 'test_supply'], expectedRevision: initial.revision };
  const restart = async () => {
    await app.close(); app = await createApp(config); await app.listen(0, '127.0.0.1');
    service = app.get(GameService); db = app.get(Database); base = await app.getUrl();
  };
  let id = '', startKey = '', originalStart: any, originalClaim: any;
  const unchanged = async () => {
    const snapshot = await service.snapshot(identity);
    assert.equal(snapshot.revision, 1); assert.deepEqual(snapshot.inventory, initial.inventory); assert.equal(snapshot.activeTrip, null);
    assert.equal(await db.trip.count({ where: { playerId: initial.player.id } }), 0);
  };
  try {
    await t.test('legacy initialization receipts stay frozen while a fresh snapshot supplies collection', async () => {
      const legacy = structuredClone(initial); delete legacy.collection;
      await db.idempotencyRecord.create({ data: { accountId: auth.account.id, operation: 'initialize', key: 'legacy_init', requestHash: digest('{}'), status: 201, response: legacy as any } });
      assert.deepEqual((await service.initialize(identity, 'legacy_init')).snapshot, legacy);
      assert.deepEqual((await service.snapshot(identity)).collection, []);
    });
    await t.test('authentication, strict loadouts and no caller-supplied time/rewards/ownership', async () => {
      assert.equal((await request('me/trips', input)).status, 401);
      assert.equal((await request('me/trips', input, auth.accessToken)).status, 400);
      for (const patch of [{ loadoutItemIds: [] }, { loadoutItemIds: ['bento'] }, { loadoutItemIds: ['test_food', 'test_food'] }, { expectedRevision: 1.5 }, { returnAt: '2000-01-01' }, { playerId: randomUUID() }, { rewards: [{ itemId: 'test_food', quantity: 9999 }] }]) {
        assert.equal((await request('me/trips', { ...input, ...patch }, auth.accessToken, 'invalid')).status, 400);
      }
      assert.equal((await request('me/trips/not-a-uuid/claim', {}, auth.accessToken, 'invalid')).status, 400);
      assert.equal((await request('me/trips', { ...input, expectedRevision: 2 }, auth.accessToken, 'stale')).body.code, 'REVISION_CONFLICT');
      await unchanged();
    });
    await t.test('insufficient second item rolls the first debit back without consuming the retry key', async () => {
      await db.inventory.update({ where: { playerId_itemId: { playerId: initial.player.id, itemId: 'test_supply' } }, data: { quantity: 0 } });
      assert.equal((await request('me/trips', input, auth.accessToken, 'shared_start')).body.code, 'INSUFFICIENT_INVENTORY');
      assert.equal((await db.inventory.findUniqueOrThrow({ where: { playerId_itemId: { playerId: initial.player.id, itemId: 'test_food' } } })).quantity, 3);
      assert.equal(await db.idempotencyRecord.count({ where: { accountId: auth.account.id, operation: 'trip.start' } }), 0);
      await db.inventory.update({ where: { playerId_itemId: { playerId: initial.player.id, itemId: 'test_supply' } }, data: { quantity: 1 } });
      await unchanged();
    });
    await t.test('departure ledger failure rolls trip and all debits back', async () => {
      await db.$executeRaw`CREATE FUNCTION wanpet_test_fail_departure() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''test departure rollback''; END'`;
      await db.$executeRaw`CREATE TRIGGER wanpet_test_fail_departure BEFORE INSERT ON "TripLedger" FOR EACH ROW WHEN (NEW.kind = 'DEPARTURE') EXECUTE FUNCTION wanpet_test_fail_departure()`;
      try {
        const result = await request('me/trips', input, auth.accessToken, 'shared_start'); assert.equal(result.status, 500); assert.equal(result.body.code, 'INTERNAL_ERROR');
        await unchanged();
        assert.equal(await db.idempotencyRecord.count({ where: { accountId: auth.account.id, operation: 'trip.start' } }), 0);
      } finally { await db.$executeRaw`DROP TRIGGER wanpet_test_fail_departure ON "TripLedger"`; await db.$executeRaw`DROP FUNCTION wanpet_test_fail_departure()`; }
    });
    await t.test('100 concurrent starts create one trip and one debit ledger', async () => {
      const keys = Array.from({ length: 100 }, (_, i) => i < 50 ? 'shared_start' : `start_${i}`);
      const results = await Promise.all(keys.map(key => request('me/trips', input, auth.accessToken, key)));
      for (const result of results) assert.ok([201, 409].includes(result.status), JSON.stringify(result));
      const winner = results.findIndex(r => r.status === 201); assert.ok(winner >= 0);
      originalStart = results[winner]!.body; startKey = keys[winner]!; id = originalStart.trip.id;
      assert.equal(new Set(results.filter(r => r.status === 201).map(r => r.body.trip.id)).size, 1);
      assert.equal(await db.trip.count({ where: { playerId: initial.player.id } }), 1);
      assert.equal(await db.tripLedger.count({ where: { tripId: id, kind: 'DEPARTURE' } }), 1);
      const snapshot = await service.snapshot(identity);
      assert.equal(snapshot.revision, 2); assert.equal(snapshot.pet.status, 'TRAVELING');
      assert.deepEqual(snapshot.inventory.map(r => r.quantity), [2, 0]); assert.deepEqual(snapshot.collection, []);
      assert.equal(Date.parse(originalStart.trip.returnAt) - Date.parse(originalStart.trip.startedAt), TEST_TRIP.durationSeconds * 1000);
      assert.equal('rewards' in originalStart.trip, false); assert.equal('rewards' in originalStart.snapshot.activeTrip, false);
      const replay = await request('me/trips', { ...input, loadoutItemIds: [...input.loadoutItemIds].reverse() }, auth.accessToken, startKey);
      assert.equal(replay.status, 201); assert.deepEqual(replay.body, originalStart);
      assert.equal((await request('me/trips', { ...input, loadoutItemIds: ['test_food'] }, auth.accessToken, startKey)).body.code, 'IDEMPOTENCY_CONFLICT');
    });
    await t.test('premature claim and a changed process clock cannot mint rewards', async () => {
      const early = await request(`me/trips/${id}/claim`, {}, auth.accessToken, 'shared_claim');
      assert.equal(early.status, 409); assert.equal(early.body.code, 'TRIP_NOT_READY');
      const realNow = Date.now;
      try {
        for (const offset of [-7, 7]) {
          Date.now = () => realNow() + offset * 86400000;
          await assert.rejects(service.claimTrip(identity, 'clock', id), (e: any) => e.code === 'TRIP_NOT_READY');
        }
      } finally { Date.now = realNow; }
      assert.equal(await db.tripLedger.count({ where: { tripId: id, kind: 'CLAIM' } }), 0);
      assert.equal(await db.idempotencyRecord.count({ where: { accountId: auth.account.id, operation: 'trip.claim' } }), 0);
      assert.equal((await service.snapshot(identity)).revision, 2);
    });
    await t.test('another account cannot read or claim the trip by guessing its ID', async () => {
      const other = await service.register((prefix + '_other') + "@example.test", prefix + '_other', 'trip other password 123');
      const foreign = await request(`me/trips/${id}/claim`, {}, other.accessToken, 'foreign');
      const missing = await request(`me/trips/${randomUUID()}/claim`, {}, other.accessToken, 'missing');
      assert.equal(foreign.status, 404); assert.equal(missing.status, 404); assert.equal(foreign.body.code, missing.body.code);
      assert.equal((await request(`me/trips/${id}/claim`, { playerId: initial.player.id }, other.accessToken, 'forged')).status, 400);
    });
    await t.test('restart recovers the same traveling pet, return time and consumed inventory', async () => {
      await restart(); const snapshot = (await request('me/snapshot', undefined, auth.accessToken)).body;
      assert.equal(snapshot.pet.id, initial.pet.id); assert.equal(snapshot.activeTrip.id, id);
      assert.equal(snapshot.activeTrip.returnAt, originalStart.trip.returnAt); assert.equal(snapshot.revision, 2);
      assert.deepEqual(snapshot.inventory.map((r: any) => r.quantity), [2, 0]);
    });
    await t.test('database time exposes readiness without granting or changing revision', async () => {
      const now = await databaseNow(db);
      // Test fixture only: mature this isolated trip without waiting a minute or adding a production time override.
      await db.trip.update({ where: { id }, data: { startedAt: new Date(now.getTime() - 120000), returnAt: new Date(now.getTime() - 1000), configVersion: 'retired-test-version' } });
      const snapshot = await service.snapshot(identity);
      assert.equal(snapshot.activeTrip!.status, 'READY_TO_CLAIM'); assert.equal(snapshot.pet.status, 'AT_HOME'); assert.equal(snapshot.revision, 2);
      assert.deepEqual(snapshot.collection, []);
    });
    await t.test('failure at final claim publication rolls inventory, collection, ledger and revision back', async () => {
      await db.$executeRaw`CREATE FUNCTION wanpet_test_fail_claim() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''test claim rollback''; END'`;
      await db.$executeRaw`CREATE TRIGGER wanpet_test_fail_claim BEFORE UPDATE ON "Trip" FOR EACH ROW WHEN (NEW."claimedAt" IS NOT NULL) EXECUTE FUNCTION wanpet_test_fail_claim()`;
      try {
        const result = await request(`me/trips/${id}/claim`, {}, auth.accessToken, 'shared_claim'); assert.equal(result.status, 500);
        const snapshot = await service.snapshot(identity); assert.equal(snapshot.revision, 2); assert.deepEqual(snapshot.inventory.map(r => r.quantity), [2, 0]); assert.deepEqual(snapshot.collection, []);
        assert.equal(await db.tripLedger.count({ where: { tripId: id, kind: 'CLAIM' } }), 0);
        assert.equal(await db.idempotencyRecord.count({ where: { accountId: auth.account.id, operation: 'trip.claim' } }), 0);
        assert.equal((await db.trip.findUniqueOrThrow({ where: { id } })).claimResponse, null);
      } finally { await db.$executeRaw`DROP TRIGGER wanpet_test_fail_claim ON "Trip"`; await db.$executeRaw`DROP FUNCTION wanpet_test_fail_claim()`; }
    });
    await t.test('100 concurrent claims publish exactly one stored reward and collection grant', async () => {
      const stored = await db.trip.findUniqueOrThrow({ where: { id } });
      const results = await Promise.all(Array.from({ length: 100 }, (_, i) => request(`me/trips/${id}/claim`, {}, auth.accessToken, i < 50 ? 'shared_claim' : `claim_${i}`)));
      for (const result of results) assert.equal(result.status, 200, JSON.stringify(result));
      originalClaim = results[0]!.body;
      for (const result of results) assert.deepEqual(result.body, originalClaim);
      assert.deepEqual(originalClaim.rewards, (stored.rewards as any[]).map(({ itemId, quantity }) => ({ itemId, quantity })));
      assert.equal(originalClaim.snapshot.revision, 3); assert.equal(originalClaim.snapshot.activeTrip, null); assert.equal(originalClaim.snapshot.pet.status, 'AT_HOME');
      assert.equal(originalClaim.snapshot.inventory.find((r: any) => r.itemId === 'test_food').quantity, 3);
      assert.equal(originalClaim.snapshot.collection.length, 1); assert.equal(originalClaim.snapshot.collection[0].quantity, 1);
      assert.equal(await db.tripLedger.count({ where: { tripId: id, kind: 'CLAIM' } }), 1);
      assert.ok((await db.trip.findUniqueOrThrow({ where: { id } })).claimedAt);
    });
    await t.test('replaying an old claim after another departure returns its frozen receipt without extra rewards', async () => {
      const next = await request('me/trips', { loadoutItemIds: ['test_food'], expectedRevision: 3 }, auth.accessToken, 'next_trip'); assert.equal(next.status, 201);
      const replay = await request(`me/trips/${id}/claim`, {}, auth.accessToken, 'another_claim_key'); assert.deepEqual(replay.body, originalClaim);
      assert.deepEqual((await request('me/trips', input, auth.accessToken, startKey)).body, originalStart);
      await restart(); const current = await service.snapshot(identity);
      assert.equal(current.revision, 4); assert.equal(current.activeTrip!.id, next.body.trip.id); assert.equal(current.collection![0]!.quantity, 1);
      assert.equal(current.inventory.find(r => r.itemId === 'test_food')!.quantity, 2);
      assert.equal(await db.tripLedger.count({ where: { tripId: id } }), 2);
    });
    await t.test('database guards reject a second active trip, duplicate claim ledger and inconsistent claim state', async () => {
      const first = await db.trip.findUniqueOrThrow({ where: { id } });
      await assert.rejects(db.trip.create({ data: { playerId: initial.player.id, configVersion: first.configVersion, destinationId: first.destinationId, loadout: [], rewards: [], startedAt: first.startedAt, returnAt: first.returnAt } }));
      await assert.rejects(db.tripLedger.create({ data: { tripId: id, kind: 'CLAIM', items: [] } }));
      await assert.rejects(db.trip.update({ where: { id }, data: { claimedAt: null } }));
      await assert.rejects(db.collectionEntry.updateMany({ where: { playerId: initial.player.id }, data: { quantity: 0 } }));
    });
  } finally { await app.close(); }
});
