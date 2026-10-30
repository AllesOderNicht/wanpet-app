import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { CatLifeRequest, PetCareRequest, PetProfileRequest, PlayerSnapshot } from '@wanpet/contracts' with { 'resolution-mode': 'import' };
import { createApp } from '../src/bootstrap';
import { loadConfig } from '../src/config';
import { Database, databaseNow } from '../src/database';
import { GameService } from '../src/service';
import { CatLifeService } from '../src/cat-life-service';
import { ChatService } from '../src/chat-service';
import { initialCat, type CatState } from '../src/cat-life';
import { JevDecisions, type PetDecisionContext } from '../src/jev';

const url = process.env.TEST_DATABASE_URL;
if (!url || !/^wanpet_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname.slice(1))) throw new Error('Isolated TEST_DATABASE_URL required');
const json = (value: unknown) => value as Prisma.InputJsonValue;
const food = (snapshot: PlayerSnapshot) => snapshot.inventory.find(item => item.itemId === 'test_food')?.quantity ?? 0;

test('pet profile, care and v2 life PostgreSQL/HTTP acceptance', { timeout: 60000 }, async t => {
  const app = await createApp(loadConfig({ NODE_ENV: 'test', DATABASE_URL: url, PORT: '0', CLIENT_ORIGIN: 'http://localhost:5173' }));
  await app.listen(0, '127.0.0.1');
  const game = app.get(GameService), db = app.get(Database), cats = app.get(CatLifeService), chats = app.get(ChatService), jev = app.get(JevDecisions);
  try {
    const auth = await game.register(('petcare_' + randomUUID().replaceAll('-', '').slice(0, 12)) + "@example.test", 'petcare_' + randomUUID().replaceAll('-', '').slice(0, 12), 'pet care synthetic password 123');
    const identity = await game.authenticate('Bearer ' + auth.accessToken), initial = (await game.initialize(identity, 'init')).snapshot;
    const other = await game.register(('petcare_' + randomUUID().replaceAll('-', '').slice(0, 12)) + "@example.test", 'petcare_' + randomUUID().replaceAll('-', '').slice(0, 12), 'pet care synthetic password 456');
    const otherIdentity = await game.authenticate('Bearer ' + other.accessToken), otherInitial = (await game.initialize(otherIdentity, 'init')).snapshot;
    const input: CatLifeRequest = { protocolVersion: 2, surface: 'interior', event: 'observe', intentId: null, expectedRevision: 0, automatic: true, target: null };
    const http = async (path: string, body?: unknown, token = auth.accessToken, key = randomUUID()) => {
      const response = await fetch((await app.getUrl()) + '/v1/me/pet/' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, 'Idempotency-Key': key }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json() as any };
    };
    const freshState = async () => initialCat(initial.pet.id, (await databaseNow(db)).getTime());
    const storeLife = async (state: CatState) => db.petLife.upsert({ where: { petId: initial.pet.id }, create: { petId: initial.pet.id, revision: 1, state: json(state) }, update: { revision: { increment: 1 }, state: json(state) } });
    const legacyTime = (await databaseNow(db)).getTime(), legacyTraits = { curiosity: 0.27, sociability: 0.43, sensitivity: 0.69 };
    const legacy = { version: 1, updatedAt: legacyTime, lastTouchAt: 0, touches: 0, automatic: true, invitation: null, temperament: legacyTraits,
      needs: { hunger: 0.28, fatigue: 0.35, stimulation: 0.45, alertness: 0.1 }, preferences: { sunny: 0.6, shelter: 0.4, food: 0.35, nearby: 0.5 }, cushion: 'shelter', decisionSource: 'rules', intent: null,
      memories: [{ id: randomUUID(), at: new Date(legacyTime - 1000).toISOString(), activity: 'watch', spot: 'sunny', kind: 'observed', text: '它在窗边安静地张望。' }] };
    await db.petLife.create({ data: { petId: initial.pet.id, revision: 7, state: json(legacy) } });
    const profileInput: PetProfileRequest = { expectedRevision: 0, nickname: '小丸', description: '喜欢窗边的绘本', voice: 'gentle', temperament: legacyTraits };

    await t.test('HTTP requires authentication and derives the pet from the authenticated owner', async () => {
      assert.equal((await http('profile', undefined, '')).status, 401);
      assert.equal((await http('profile', profileInput, '')).status, 401);
      assert.equal((await http('care', { operation: 'feed', source: 'inventory', expectedRevision: 7 }, '')).status, 401);
      assert.equal((await http('profile')).body.petId, initial.pet.id);
      assert.equal((await http('profile', undefined, other.accessToken)).body.petId, otherInitial.pet.id);
      assert.equal((await http('profile?petId=' + otherInitial.pet.id)).body.petId, initial.pet.id);
      assert.equal((await http('profile', { ...profileInput, petId: otherInitial.pet.id })).status, 400);
      assert.equal((await http('care', { operation: 'feed', source: 'inventory', expectedRevision: 7, petId: otherInitial.pet.id })).status, 400);
      assert.deepEqual((await game.snapshot(otherIdentity)).inventory, otherInitial.inventory);
    });

    await t.test('profile defaults preserve old temperament; renames and edits retain identity and frozen replay', async () => {
      const defaults = await cats.profile(identity), before = await cats.view(identity);
      assert.equal(defaults.revision, 0); assert.deepEqual(defaults.temperament, legacyTraits); assert.equal(defaults.petId, initial.pet.id);
      assert.equal(before.version, 2); assert.deepEqual(before.memories, legacy.memories); assert.deepEqual(before.temperament, legacyTraits);
      const key = randomUUID(), renamed = await http('profile', profileInput, auth.accessToken, key);
      assert.equal(renamed.status, 200); assert.equal(renamed.body.revision, 1); assert.equal(renamed.body.petId, initial.pet.id); assert.equal(renamed.body.nickname, '小丸');
      const life = await cats.view(identity), snapshot = await game.snapshot(identity);
      assert.equal(snapshot.pet.id, initial.pet.id); assert.equal(snapshot.pet.nickname, '小丸'); assert.deepEqual(life.temperament, legacyTraits); assert.deepEqual(life.memories, before.memories);
      const changed: PetProfileRequest = { ...profileInput, expectedRevision: 1, nickname: '丸丸', voice: 'quiet', temperament: { curiosity: 0.71, sociability: 0.32, sensitivity: 0.44 } };
      const updated = await http('profile', changed); assert.equal(updated.status, 200); assert.equal(updated.body.revision, 2);
      assert.deepEqual((await cats.view(identity)).temperament, changed.temperament);
      const replay = await http('profile', profileInput, auth.accessToken, key); assert.deepEqual(replay, renamed);
      assert.equal((await cats.profile(identity)).nickname, '丸丸'); assert.equal((await game.snapshot(identity)).pet.id, initial.pet.id);
      const stale = await http('profile', profileInput); assert.equal(stale.status, 409); assert.equal(stale.body.code, 'REVISION_CONFLICT');
      const conflict = await http('profile', changed, auth.accessToken, key); assert.equal(conflict.status, 409); assert.equal(conflict.body.code, 'IDEMPOTENCY_CONFLICT');
      assert.equal((await cats.profile(otherIdentity)).nickname, otherInitial.pet.nickname);
    });

    await t.test('concurrent inventory feeding with one key consumes exactly one item and one life revision', async () => {
      const state = await freshState(); state.facilities.food.portions = 2;
      const row = await storeLife(state), before = await game.snapshot(identity), key = randomUUID();
      const command: PetCareRequest = { operation: 'feed', source: 'inventory', expectedRevision: row.revision };
      const results = await Promise.all(Array.from({ length: 20 }, () => cats.care(identity, key, command)));
      for (const result of results) assert.deepEqual(result, results[0]);
      assert.equal(results[0]!.body.life.facilities!.food.portions, 3); assert.equal(results[0]!.body.life.revision, row.revision + 1);
      const after = await game.snapshot(identity); assert.equal(food(after), food(before) - 1); assert.equal(after.revision, before.revision + 1);
      assert.deepEqual(await cats.care(identity, key, command), results[0]);
      assert.equal(await db.idempotencyRecord.count({ where: { accountId: identity.accountId, operation: 'pet.care', key } }), 1);
      assert.deepEqual((await game.snapshot(otherIdentity)).inventory, otherInitial.inventory);
    });

    await t.test('full bowls and missing inventory leave stock, state, revisions and receipts unchanged', async () => {
      const fullRow = await db.petLife.findUniqueOrThrow({ where: { petId: initial.pet.id } }), fullStock = await game.snapshot(identity), fullKey = randomUUID();
      const full = await http('care', { operation: 'feed', source: 'inventory', expectedRevision: fullRow.revision }, auth.accessToken, fullKey);
      assert.equal(full.status, 409); assert.equal(full.body.code, 'BOWL_FULL');
      assert.equal(food(await game.snapshot(identity)), food(fullStock)); assert.deepEqual(await db.petLife.findUniqueOrThrow({ where: { petId: initial.pet.id } }), fullRow);
      assert.equal(await db.idempotencyRecord.count({ where: { accountId: identity.accountId, operation: 'pet.care', key: fullKey } }), 0);
      const state = await freshState(); state.facilities.food.portions = 2;
      const emptyRow = await storeLife(state);
      await db.inventory.update({ where: { playerId_itemId: { playerId: initial.player.id, itemId: 'test_food' } }, data: { quantity: 0 } });
      const emptyStock = await game.snapshot(identity), emptyKey = randomUUID();
      const empty = await http('care', { operation: 'feed', source: 'inventory', expectedRevision: emptyRow.revision }, auth.accessToken, emptyKey);
      assert.equal(empty.status, 409); assert.equal(empty.body.code, 'INSUFFICIENT_INVENTORY');
      const after = await game.snapshot(identity); assert.equal(food(after), 0); assert.equal(after.revision, emptyStock.revision);
      assert.deepEqual(await db.petLife.findUniqueOrThrow({ where: { petId: initial.pet.id } }), emptyRow);
      assert.equal(await db.idempotencyRecord.count({ where: { accountId: identity.accountId, operation: 'pet.care', key: emptyKey } }), 0);
      const basic = await http('care', { operation: 'feed', source: 'basic', expectedRevision: emptyRow.revision });
      assert.equal(basic.status, 200); assert.equal(basic.body.life.facilities.food.portions, 3); assert.equal(food(basic.body.snapshot), 0); assert.equal(basic.body.snapshot.revision, emptyStock.revision);
    });

    await t.test('v2 arrival starts server use time and repeated arrival or completion cannot consume twice', async () => {
      const state = await freshState(); state.needs.hunger = 0.85; state.facilities.food.portions = 2;
      const row = await storeLife(state), stock = await game.snapshot(identity), originalDecide = jev.decide;
      jev.decide = async () => 'eat_food';
      try {
        const moving = await http('life', { ...input, expectedRevision: row.revision });
        assert.equal(moving.status, 200); assert.equal(moving.body.intent.activity, 'eat'); assert.equal(moving.body.intent.stage, 'moving'); assert.equal(moving.body.facilities.food.portions, 2);
        const id: string = moving.body.intent.id;
        let persisted = await db.petLife.findUniqueOrThrow({ where: { petId: initial.pet.id } }), current = persisted.state as unknown as CatState;
        current.intent!.startedAt = new Date((await databaseNow(db)).getTime() - (current.intent!.durationSeconds + 1) * 1000).toISOString();
        await db.petLife.update({ where: { petId: initial.pet.id }, data: { state: json(current) } });
        const premature = await http('life', { ...input, event: 'complete', intentId: id, expectedRevision: persisted.revision });
        assert.equal(premature.body.memories.length, 0); assert.equal(premature.body.intent.stage, 'moving'); assert.equal(premature.body.facilities.food.portions, 2);
        const beforeArrival = (await databaseNow(db)).getTime(), arrivalKey = randomUUID();
        const arrivalInput = { ...input, event: 'arrived', intentId: id, expectedRevision: premature.body.revision };
        const arrived = await http('life', arrivalInput, auth.accessToken, arrivalKey), afterArrival = (await databaseNow(db)).getTime();
        assert.equal(arrived.status, 200); assert.equal(arrived.body.intent.stage, 'using'); assert.equal(arrived.body.facilities.food.portions, 1);
        assert.ok(Date.parse(arrived.body.intent.usingAt) >= beforeArrival && Date.parse(arrived.body.intent.usingAt) <= afterArrival);
        assert.deepEqual(await http('life', arrivalInput, auth.accessToken, arrivalKey), arrived);
        const repeated = await http('life', { ...arrivalInput, expectedRevision: arrived.body.revision });
        assert.equal(repeated.body.facilities.food.portions, 1); assert.equal(repeated.body.intent.usingAt, arrived.body.intent.usingAt);
        const early = await http('life', { ...input, event: 'complete', intentId: id, expectedRevision: repeated.body.revision });
        assert.equal(early.body.memories.length, 0); assert.equal(early.body.intent.stage, 'using');
        persisted = await db.petLife.findUniqueOrThrow({ where: { petId: initial.pet.id } }); current = persisted.state as unknown as CatState;
        current.intent!.usingAt = new Date((await databaseNow(db)).getTime() - current.intent!.durationSeconds * 1000 - 500).toISOString();
        await db.petLife.update({ where: { petId: initial.pet.id }, data: { state: json(current) } });
        const complete: CatLifeRequest = { ...input, event: 'complete', intentId: id, expectedRevision: persisted.revision };
        const results = await Promise.all(Array.from({ length: 15 }, (_, i) => cats.advance(identity, 'complete-' + id + '-' + i, complete)));
        assert.ok(results.every(result => result.body.memories.length === 1 && result.body.facilities!.food.portions === 1));
        assert.equal(new Set(results.map(result => result.body.memories[0]!.id)).size, 1);
        const latest = await cats.view(identity), duplicate = await cats.advance(identity, randomUUID(), { ...complete, expectedRevision: latest.revision });
        assert.equal(duplicate.body.memories.length, 1); assert.equal(duplicate.body.facilities!.food.portions, 1); assert.equal(food(await game.snapshot(identity)), food(stock));
      } finally { jev.decide = originalDecide; }
    });

    await t.test('forgetting during a delayed decision discards old memory selection and keeps pets isolated', async () => {
      const state = await freshState(); state.needs = { hunger: 0.1, fatigue: 0.55, stimulation: 0, alertness: 0 };
      const row = await storeLife(state), room = await db.chatRoom.upsert({ where: { petId: initial.pet.id }, create: { petId: initial.pet.id }, update: {} });
      await db.chatRoom.upsert({ where: { petId: otherInitial.pet.id }, create: { petId: otherInitial.pet.id }, update: {} });
      const remembered = '它喜欢安静地看书，尤其是窗边绘本。', foreign = '另一只宠物喜欢窗边的玩具。';
      await db.longMemory.create({ data: { petId: initial.pet.id, text: remembered } });
      const otherMemory = await db.longMemory.create({ data: { petId: otherInitial.pet.id, text: foreign } });
      let release!: () => void, entered!: () => void, context: PetDecisionContext | undefined;
      const held = new Promise<void>(resolve => { release = resolve; }), waiting = new Promise<void>(resolve => { entered = resolve; });
      const originalDecide = jev.decide;
      jev.decide = async (_petId, _revision, _state, _event, options, _now, value) => { context = value; assert.ok(options.read_reading); entered(); await held; return 'read_reading'; };
      const slow = cats.advance(identity, randomUUID(), { ...input, expectedRevision: row.revision });
      try {
        await waiting;
        assert.ok(context!.memories.includes(remembered)); assert.ok(!context!.memories.includes(foreign)); assert.equal(context!.epoch, room.epoch);
        await chats.manageMemory(identity, randomUUID(), 'clear');
        assert.equal((await db.chatRoom.findUniqueOrThrow({ where: { petId: initial.pet.id } })).epoch, room.epoch + 1);
        release(); const result = await slow;
        assert.equal(result.body.decisionSource, 'rules'); assert.notEqual(result.body.intent?.activity, 'read');
        assert.equal(await db.longMemory.count({ where: { petId: initial.pet.id, active: true } }), 0);
        assert.equal((await db.longMemory.findUniqueOrThrow({ where: { id: otherMemory.id } })).active, true);
        let after: PetDecisionContext | undefined;
        jev.decide = async (_petId, _revision, _state, _event, _options, _now, value) => { after = value; return undefined; };
        await cats.advance(identity, randomUUID(), { ...input, surface: 'courtyard', expectedRevision: result.body.revision });
        assert.equal(after!.epoch, room.epoch + 1); assert.deepEqual(after!.memories, []);
      } finally { release(); await slow.catch(() => {}); jev.decide = originalDecide; }
    });
  } finally { await app.close(); }
});
