import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CatLifeRequest, PetCareRequest } from '@wanpet/contracts' with { 'resolution-mode': 'import' };
import { advanceCat, applyCare, catOptions, chooseCat, initialCat, migrateCat, petCareRequest } from '../src/cat-life';
import { ApiError } from '../src/errors';

const now = Date.parse('2026-10-29T04:00:00Z');
const input: CatLifeRequest = { protocolVersion: 2, surface: 'interior', event: 'observe', automatic: true, intentId: null, expectedRevision: 0, target: null };
const report = (event: CatLifeRequest['event'], intentId: string): CatLifeRequest => ({ ...input, event, intentId });
const care: PetCareRequest = { operation: 'feed', source: 'basic', expectedRevision: 0 };
const errorCode = (code: string) => (error: unknown) => error instanceof ApiError && error.code === code;

test('v1 migration preserves personality, intent identity and history without changing the source', () => {
  const legacy = { version: 1, updatedAt: now - 1000, lastTouchAt: now - 2000, touches: 2, automatic: true, invitation: null,
    temperament: { curiosity: 0.21, sociability: 0.43, sensitivity: 0.67 }, needs: { hunger: 0.3, fatigue: 0.4, stimulation: 0.2, alertness: 0.1 },
    preferences: { sunny: 0.8, shelter: 0.2, food: 0.4, nearby: 0.6 }, cushion: 'sunny', decisionSource: 'rules',
    intent: { id: '00000000-0000-0000-0000-000000000011', activity: 'sleep', spot: 'shelter', surface: 'interior', startedAt: new Date(now - 1000).toISOString(), durationSeconds: 90 },
    memories: [{ id: '00000000-0000-0000-0000-000000000012', at: new Date(now - 2000).toISOString(), activity: 'watch', spot: 'sunny', kind: 'observed', text: '它在窗边张望。' }] };
  const before = structuredClone(legacy), migrated = migrateCat(legacy, 'existing-pet', now);
  assert.equal(migrated.version, 2); assert.equal(migrated.updatedAt, legacy.updatedAt);
  assert.deepEqual(migrated.temperament, legacy.temperament); assert.deepEqual(migrated.intent, legacy.intent); assert.deepEqual(migrated.memories, legacy.memories);
  for (const [spot, preference] of Object.entries(legacy.preferences)) assert.equal(migrated.preferences[spot as keyof typeof legacy.preferences], preference);
  assert.equal(migrated.facilities.food.portions, 3); assert.ok(migrated.body.cleanliness > 0); assert.ok(migrated.mood);
  migrated.temperament.curiosity = 1; migrated.memories[0]!.text = 'changed';
  assert.deepEqual(legacy, before);
  assert.throws(() => migrateCat({ version: 3 }, 'existing-pet', now)); assert.throws(() => migrateCat(null, 'existing-pet', now));
});

test('v2 eating reserves while moving, consumes once on arrival and completes only after server use time', () => {
  const moving = initialCat('hungry-pet', now); moving.needs.hunger = 0.8;
  chooseCat(moving, input, now, 'eat_food');
  const id = moving.intent!.id, duration = moving.intent!.durationSeconds * 1000, before = structuredClone(moving);
  assert.equal(moving.intent!.stage, 'moving'); assert.equal(moving.facilities.food.reservedBy, id); assert.equal(moving.facilities.food.portions, 3);
  const started = advanceCat(moving, report('started', id), now + 100, 0);
  assert.equal(started.intent!.stage, 'moving'); assert.equal(started.facilities.food.portions, 3);
  const tooSoon = advanceCat(started, report('arrived', id), now + 299, 0);
  assert.equal(tooSoon.intent!.stage, 'moving'); assert.equal(tooSoon.facilities.food.portions, 3);
  const wrong = advanceCat(tooSoon, report('arrived', '00000000-0000-0000-0000-000000000099'), now + 400, 0);
  assert.equal(wrong.facilities.food.portions, 3); assert.equal(wrong.intent!.stage, 'moving');
  const usingAt = now + 1000, using = advanceCat(wrong, report('arrived', id), usingAt, 0);
  assert.equal(using.intent!.stage, 'using'); assert.equal(using.intent!.usingAt, new Date(usingAt).toISOString());
  assert.equal(using.facilities.food.portions, 2); assert.equal(using.facilities.food.reservedBy, null); assert.equal(using.memories.length, 0);
  const repeatedArrival = advanceCat(using, report('arrived', id), usingAt + 1, 0);
  assert.equal(repeatedArrival.facilities.food.portions, 2); assert.equal(repeatedArrival.intent!.usingAt, using.intent!.usingAt);
  const early = advanceCat(repeatedArrival, report('complete', id), usingAt + duration - 1, 0);
  assert.equal(early.intent!.stage, 'using'); assert.equal(early.memories.length, 0); assert.ok(early.needs.hunger >= moving.needs.hunger);
  const completed = advanceCat(early, report('complete', id), usingAt + duration, 0);
  assert.equal(completed.intent, null); assert.equal(completed.facilities.food.portions, 2); assert.equal(completed.memories.length, 1);
  assert.equal(completed.memories[0]!.activity, 'eat'); assert.ok(completed.needs.hunger < 0.4); assert.ok(completed.body.bowel > moving.body.bowel);
  const replay = advanceCat(completed, report('complete', id), usingAt + duration + 1, 0);
  assert.equal(replay.facilities.food.portions, 2); assert.deepEqual(replay.memories, completed.memories);
  assert.deepEqual(moving, before);
});

test('blocking before arrival releases the food reservation without consumption or a completed memory', () => {
  const moving = initialCat('blocked-pet', now); chooseCat(moving, input, now, 'eat_food');
  const id = moving.intent!.id, before = structuredClone(moving);
  const blocked = advanceCat(moving, report('blocked', id), now + 500, 0);
  assert.equal(blocked.intent, null); assert.equal(blocked.facilities.food.reservedBy, null); assert.equal(blocked.facilities.food.portions, 3); assert.deepEqual(blocked.memories, []);
  const late = advanceCat(blocked, report('arrived', id), now + 1000, 0);
  assert.equal(late.intent, null); assert.equal(late.facilities.food.portions, 3); assert.deepEqual(moving, before);
});

test('arrival in another room, after expiry or from a previous home stay cannot consume food', () => {
  for (const scenario of [{ surface: 'courtyard' as const, elapsed: 1000, atHomeSince: 0 }, { surface: 'interior' as const, elapsed: 156000, atHomeSince: 0 }, { surface: 'interior' as const, elapsed: 1000, atHomeSince: now + 500 }]) {
    const moving = initialCat('stale-arrival-pet', now); chooseCat(moving, input, now, 'eat_food');
    const stale = advanceCat(moving, { ...report('arrived', moving.intent!.id), surface: scenario.surface }, now + scenario.elapsed, scenario.atHomeSince);
    assert.equal(stale.intent, null); assert.equal(stale.facilities.food.portions, 3); assert.equal(stale.facilities.food.reservedBy, null); assert.deepEqual(stale.memories, []);
  }
});

test('blocking, touching, pausing or changing rooms credits a used meal share exactly once', () => {
  const interruptions: Partial<CatLifeRequest>[] = [{ event: 'blocked' }, { event: 'stroke', intentId: null }, { event: 'observe', intentId: null, automatic: false }, { event: 'observe', intentId: null, surface: 'courtyard' }];
  for (const activity of ['eat', 'drink'] as const) for (const interruption of interruptions) {
    const moving = initialCat('interrupted-meal-pet', now); moving.needs.hunger = 0.8; moving.body.thirst = 0.8;
    chooseCat(moving, input, now, activity === 'eat' ? 'eat_food' : 'drink_water');
    const id = moving.intent!.id, using = advanceCat(moving, report('arrived', id), now + 1000, 0);
    const interrupted = advanceCat(using, { ...report('blocked', id), ...interruption }, now + 16000, 0);
    const bowl = activity === 'eat' ? interrupted.facilities.food : interrupted.facilities.water;
    assert.equal(interrupted.intent, null); assert.equal(bowl.portions, 2); assert.equal(bowl.reservedBy, null); assert.deepEqual(interrupted.memories, []);
    if (activity === 'eat') { assert.ok(interrupted.needs.hunger > 0.5 && interrupted.needs.hunger < 0.6); assert.ok(interrupted.body.bowel > 0.2 && interrupted.body.bowel < 0.3); }
    else assert.ok(interrupted.body.thirst > 0.3 && interrupted.body.thirst < 0.4);
    const late = advanceCat(interrupted, { ...report('complete', id), surface: interruption.surface ?? 'interior' }, now + 16000, 0);
    assert.equal(late.needs.hunger, interrupted.needs.hunger); assert.equal(late.body.thirst, interrupted.body.thirst); assert.equal(late.body.bowel, interrupted.body.bowel);
    assert.deepEqual(late.facilities, interrupted.facilities); assert.deepEqual(late.memories, []);
  }
});

test('an expired using stage settles its consumed portion without a false completed memory', () => {
  const moving = initialCat('expired-meal-pet', now); moving.needs.hunger = 0.8; chooseCat(moving, input, now, 'eat_food');
  const id = moving.intent!.id, using = advanceCat(moving, report('arrived', id), now + 1000, 0);
  const expired = advanceCat(using, report('complete', id), now + 156000, 0);
  assert.equal(expired.intent, null); assert.equal(expired.facilities.food.portions, 2); assert.ok(expired.needs.hunger > 0.25 && expired.needs.hunger < 0.27); assert.deepEqual(expired.memories, []);
  const replay = advanceCat(expired, report('complete', id), now + 156000, 0);
  assert.equal(replay.needs.hunger, expired.needs.hunger); assert.equal(replay.facilities.food.portions, 2); assert.deepEqual(replay.memories, []);
});

test('away recovery settles an already consumed meal before choosing another activity', () => {
  for (const activity of ['eat', 'drink'] as const) {
    const moving = initialCat('recovering-meal-pet', now); moving.needs.hunger = activity === 'eat' ? 0.8 : 0.1; moving.body.thirst = activity === 'drink' ? 0.8 : 0.1;
    chooseCat(moving, input, now, activity === 'eat' ? 'eat_food' : 'drink_water');
    const id = moving.intent!.id, using = advanceCat(moving, report('arrived', id), now + 1000, 0);
    const away = advanceCat(using, input, now + 301000, 0);
    const bowl = activity === 'eat' ? away.facilities.food : away.facilities.water;
    assert.equal(bowl.portions, 2); assert.equal(bowl.reservedBy, null); assert.equal(away.intent, null);
    assert.ok(away.memories.every(memory => memory.activity !== activity));
    if (activity === 'eat') assert.ok(away.needs.hunger < 0.3); else assert.ok(away.body.thirst < 0.2);
    const replay = advanceCat(away, report('complete', id), now + 301000, 0);
    assert.deepEqual(replay.facilities, away.facilities); assert.deepEqual(replay.memories, away.memories); assert.equal(replay.needs.hunger, away.needs.hunger); assert.equal(replay.body.thirst, away.body.thirst);
  }
});

test('empty food and water bowls exclude resource activities even under urgent hunger', () => {
  const state = initialCat('empty-bowls', now); state.needs.hunger = 1; state.facilities.food.portions = 0; state.facilities.water.portions = 0;
  const options = Object.values(catOptions(state, input, now));
  assert.ok(options.length > 0); assert.ok(options.every(option => !['eat', 'drink'].includes(option.activity)));
  chooseCat(state, input, now, 'eat_food'); assert.notEqual(state.intent!.activity, 'eat'); assert.equal(state.facilities.food.reservedBy, null);
});

test('toilet completion changes body and facility once; cleaning waits for the activity to end', () => {
  const moving = initialCat('toilet-pet', now); moving.body.bowel = 0.85; moving.body.cleanliness = 0.5;
  chooseCat(moving, input, now, 'toilet_toilet');
  const id = moving.intent!.id, clean: PetCareRequest = { ...care, operation: 'clean_toilet' };
  assert.throws(() => applyCare(moving, clean), errorCode('FACILITY_BUSY'));
  const usingAt = now + 500, using = advanceCat(moving, report('arrived', id), usingAt, 0);
  assert.throws(() => applyCare(using, clean), errorCode('FACILITY_BUSY'));
  const completed = advanceCat(using, report('complete', id), usingAt + using.intent!.durationSeconds * 1000, 0);
  assert.equal(completed.intent, null); assert.equal(completed.body.bowel, 0.05); assert.equal(completed.facilities.toilet.uses, 1); assert.ok(completed.facilities.toilet.cleanliness < 1);
  const replay = advanceCat(completed, report('complete', id), completed.updatedAt + 1, 0);
  assert.deepEqual(replay.facilities.toilet, completed.facilities.toilet); assert.deepEqual(replay.memories, completed.memories);
  const before = structuredClone(completed), cleaned = applyCare(completed, clean);
  assert.deepEqual(cleaned.facilities.toilet, { cleanliness: 1, uses: 0 }); assert.ok(cleaned.body.cleanliness > completed.body.cleanliness); assert.deepEqual(completed, before);
});

test('reading counts only a completed use stage, ignoring movement completion and duplicate reports', () => {
  const moving = initialCat('reading-pet', now); chooseCat(moving, input, now, 'read_reading');
  const id = moving.intent!.id, duration = moving.intent!.durationSeconds * 1000;
  const notArrived = advanceCat(moving, report('complete', id), now + duration, 0);
  assert.equal(notArrived.intent!.stage, 'moving'); assert.equal(notArrived.facilities.reading.sessions, 0); assert.equal(notArrived.memories.length, 0);
  const usingAt = now + duration + 500, using = advanceCat(notArrived, report('arrived', id), usingAt, 0);
  const early = advanceCat(using, report('complete', id), usingAt + duration - 1, 0);
  assert.equal(early.facilities.reading.sessions, 0);
  const completed = advanceCat(early, report('complete', id), usingAt + duration, 0);
  assert.equal(completed.facilities.reading.sessions, 1); assert.equal(completed.memories[0]!.activity, 'read'); assert.equal(completed.intent, null);
  const replay = advanceCat(completed, report('complete', id), usingAt + duration + 1, 0);
  assert.equal(replay.facilities.reading.sessions, 1); assert.deepEqual(replay.memories, completed.memories);
});

test('care commands require exact fields, known string sources and safe integer revisions', () => {
  for (const value of [care, { ...care, source: 'inventory' }, { ...care, operation: 'refill_water' }, { ...care, operation: 'clean_toilet', expectedRevision: 2147483646 }]) assert.deepEqual(petCareRequest(value), value);
  const invalid = (value: unknown) => assert.throws(() => petCareRequest(value), errorCode('INVALID_INPUT'));
  for (const value of [null, [], 'feed', { ...care, petId: 'other-pet' }, { ...care, quantity: 10 }, { operation: 'feed', source: 'basic' }]) invalid(value);
  for (const operation of ['grant', ['feed'], null]) invalid({ ...care, operation });
  for (const source of ['reward', ['basic'], null, 1]) invalid({ ...care, source });
  for (const operation of ['refill_water', 'clean_toilet']) invalid({ ...care, operation, source: 'inventory' });
  for (const expectedRevision of [-1, 0.5, 2147483647, NaN, Infinity, '0', null]) invalid({ ...care, expectedRevision });
});

test('care changes a copied state, bounds bowls and never changes the supplied command', () => {
  const state = initialCat('care-pet', now); state.facilities.food.portions = 2; state.facilities.water.portions = 0;
  const before = structuredClone(state), command = structuredClone(care), fed = applyCare(state, command);
  assert.equal(fed.facilities.food.portions, 3); assert.deepEqual(state, before); assert.deepEqual(command, care);
  assert.throws(() => applyCare(fed, command), errorCode('BOWL_FULL')); assert.equal(fed.facilities.food.portions, 3);
  const watered = applyCare(state, { ...care, operation: 'refill_water' });
  assert.equal(watered.facilities.water.portions, 3); assert.deepEqual(state, before);
  assert.throws(() => applyCare(watered, { ...care, operation: 'refill_water' }), errorCode('BOWL_FULL'));
});

test('long away simulation is bounded, uses basic facilities and leaves the player save untouched', () => {
  const state = initialCat('away-pet', now); state.facilities.food.portions = 0; state.facilities.water.portions = 0; state.facilities.toilet.cleanliness = 0;
  const save = { petLife: state, inventory: [{ itemId: 'test_food', quantity: 2 }], collection: [], revision: 7 }, before = structuredClone(save);
  const awayAt = now + 30 * 86400000, away = advanceCat(save.petLife, input, awayAt, 0);
  assert.equal(away.memories.length, 3); assert.ok(away.memories.every(memory => memory.kind === 'away')); assert.equal(away.intent, null);
  for (const value of [...Object.values(away.needs), ...Object.values(away.body), away.mood.pleasure, away.mood.energy, away.mood.safety]) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
  for (const bowl of [away.facilities.food, away.facilities.water]) { assert.ok(Number.isInteger(bowl.portions) && bowl.portions >= 0 && bowl.portions <= 3); assert.equal(bowl.reservedBy, null); }
  const replay = advanceCat(away, input, awayAt, 0); assert.deepEqual(replay.memories, away.memories);
  assert.equal(Object.hasOwn(away, 'inventory'), false); assert.equal(Object.hasOwn(away, 'rewards'), false); assert.deepEqual(save, before);
});

test('observing with autonomy already off preserves a manually invited activity', () => {
  const manual = initialCat('manual-reader', now); manual.automatic = false;
  chooseCat(manual, { ...input, automatic: false, event: 'invite', target: 'sunny', invitedActivity: 'read' }, now, 'read_reading');
  const id = manual.intent!.id;
  const using = advanceCat(manual, { ...report('arrived', id), automatic: false }, now + 1000, 0);
  assert.equal(using.intent?.stage, 'using');
  const resumed = advanceCat(using, { ...input, automatic: false }, now + 3000, 0);
  assert.equal(resumed.intent?.id, id);
  const done = advanceCat(resumed, { ...report('complete', id), automatic: false }, now + 46000, 0);
  assert.equal(done.intent, null); assert.equal(done.facilities.reading.sessions, 1);
  assert.deepEqual(catOptions(done, { ...input, automatic: false }, now + 47000), {});
});
