import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/bootstrap';
import { loadConfig } from '../src/config';
import { Database, databaseNow } from '../src/database';
import { GameService } from '../src/service';
import { CatLifeService } from '../src/cat-life-service';
import { JevDecisions } from '../src/jev';
import type { CatState } from '../src/cat-life';
import type { CatLifeRequest } from '@wanpet/contracts' with { 'resolution-mode': 'import' };
const url = process.env.TEST_DATABASE_URL;
if (!url || !/^wanpet_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname.slice(1))) throw new Error('Isolated TEST_DATABASE_URL required');
test('cat life PostgreSQL and HTTP acceptance', async t => {
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: url, PORT: '0', CLIENT_ORIGIN: 'http://localhost:5173' });
  let app = await createApp(config); await app.listen(0, '127.0.0.1');
  let game = app.get(GameService), db = app.get(Database), cats = app.get(CatLifeService);
  const auth = await game.register(('catlife_' + randomUUID().replaceAll('-', '').slice(0, 12)) + "@example.test", 'catlife_' + randomUUID().replaceAll('-', '').slice(0, 12), 'cat life test password 123');
  const identity = await game.authenticate('Bearer ' + auth.accessToken);
  const initial = (await game.initialize(identity, 'init')).snapshot;
  const input: CatLifeRequest = { surface: 'interior', event: 'observe', intentId: null, expectedRevision: 0, automatic: true, target: null };
  const http = async (body: unknown, token = auth.accessToken, key = randomUUID()) => {
    const r = await fetch((await app.getUrl()) + '/v1/me/pet/life', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, 'Idempotency-Key': key }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() as any };
  };
  try {
    await t.test('authenticated server-owned state and concurrent initialization', async () => {
      assert.equal((await http(input, '')).status, 401);
      assert.equal((await http({ ...input, playerId: initial.player.id })).status, 400);
      const results = await Promise.all(Array.from({ length: 30 }, (_, i) => cats.advance(identity, 'first-' + i, input)));
      assert.ok(results.every(r => r.body.revision === 1));
      assert.equal(new Set(results.map(r => r.body.intent?.id)).size, 1);
      assert.equal(await db.petLife.count({ where: { petId: initial.pet.id } }), 1);
      const snapshot = await game.snapshot(identity);
      assert.deepEqual(snapshot.inventory, initial.inventory); assert.equal(snapshot.revision, initial.revision);
    });
    await t.test('idempotent replay is frozen and conflicting payloads fail', async () => {
      const fresh = await cats.advance(identity, 'refresh', { ...input, expectedRevision: 1 });
      assert.deepEqual(await cats.advance(identity, 'refresh', { ...input, expectedRevision: 1 }), fresh);
      await assert.rejects(cats.advance(identity, 'refresh', { ...input, expectedRevision: 1, surface: 'courtyard' }), (e: any) => e.getStatus() === 409);
    });
    await t.test('completion is time gated and concurrent completions produce one memory', async () => {
      let row = await db.petLife.findUniqueOrThrow({ where: { petId: initial.pet.id } });
      const state = row.state as unknown as CatState;
      const complete = { ...input, expectedRevision: row.revision, event: 'complete' as const, intentId: state.intent!.id };
      const early = await cats.advance(identity, 'early', complete); assert.equal(early.body.memories.length, 0);
      row = await db.petLife.findUniqueOrThrow({ where: { petId: initial.pet.id } });
      const ready = row.state as unknown as CatState;
      ready.intent!.startedAt = new Date((await databaseNow(db)).getTime() - (ready.intent!.durationSeconds + 1) * 1000).toISOString();
      await db.petLife.update({ where: { petId: initial.pet.id }, data: { state: ready as any } });
      const results = await Promise.all(Array.from({ length: 30 }, (_, i) => cats.advance(identity, 'complete-' + i, { ...complete, expectedRevision: row.revision })));
      assert.ok(results.every(r => r.body.memories.length === 1));
      assert.equal(new Set(results.map(r => r.body.memories[0]!.id)).size, 1);
    });
    await t.test('restart preserves personality, memories and cushion placement', async () => {
      const row = await db.petLife.findUniqueOrThrow({ where: { petId: initial.pet.id } });
      const before = (await cats.advance(identity, 'cushion', { ...input, expectedRevision: row.revision, event: 'move_cushion', target: 'sunny' })).body;
      await app.close(); app = await createApp(config); await app.listen(0, '127.0.0.1');
      game = app.get(GameService); db = app.get(Database); cats = app.get(CatLifeService);
      const after = (await cats.advance(identity, 'after-restart', { ...input, expectedRevision: before.revision })).body;
      assert.deepEqual(after.temperament, before.temperament); assert.deepEqual(after.memories, before.memories); assert.equal(after.cushion, 'sunny');
    });
    await t.test('slow model does not lock travel; a trip wins over an in-flight home decision', async () => {
      const row = await db.petLife.findUniqueOrThrow({ where: { petId: initial.pet.id } });
      const state = row.state as unknown as CatState; state.intent = null;
      await db.petLife.update({ where: { petId: initial.pet.id }, data: { state: state as any } });
      let entered!: () => void, finish!: () => void;
      const waiting = new Promise<void>(resolve => { entered = resolve; });
      app.get(JevDecisions).decide = async () => { entered(); await new Promise<void>(resolve => { finish = resolve; }); return 'watch_sunny'; };
      const slow = cats.advance(identity, 'slow', { ...input, expectedRevision: row.revision });
      await waiting;
      const trip = await game.startTrip(identity, 'trip', { expectedRevision: initial.revision, loadoutItemIds: ['test_food'] });
      finish(); const result = await slow;
      assert.equal(trip.body.trip.status, 'TRAVELING'); assert.equal(result.body.intent, null);
      const during = await cats.advance(identity, 'during-trip', { ...input, expectedRevision: result.body.revision, event: 'complete', intentId: 'a'.repeat(36) });
      assert.equal(during.body.memories.length, result.body.memories.length);
      assert.equal((await game.snapshot(identity)).inventory.find(i => i.itemId === 'test_food')?.quantity, 2);
    });
    await t.test('logout revokes life writes and keeps state unchanged', async () => {
      const row = await db.petLife.findUniqueOrThrow({ where: { petId: initial.pet.id } });
      await game.logout(identity);
      assert.equal((await http({ ...input, expectedRevision: row.revision })).status, 401);
      assert.equal((await db.petLife.findUniqueOrThrow({ where: { petId: initial.pet.id } })).revision, row.revision);
    });
  } finally { await app.close(); }
});
