import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceCat, catLifeRequest, catOptions, chooseCat, initialCat } from '../src/cat-life';
import { JevDecisions, jevChoice } from '../src/jev';
import { loadConfig } from '../src/config';
import type { CatLifeRequest } from '@wanpet/contracts' with { 'resolution-mode': 'import' };
const now = Date.parse('2026-10-23T04:00:00Z');
const input: CatLifeRequest = { surface: 'interior', event: 'observe', automatic: true, intentId: null, expectedRevision: 0, target: null };
test('cat inputs reject arbitrary commands, places, clocks, identities and rewards', () => {
  assert.deepEqual(catLifeRequest(input), input);
  for (const patch of [{ playerId: 'other' }, { rewards: [] }, { now: 0 }, { event: 'execute' }, { target: 'window-roof' }, { surface: 'unknown' }, { expectedRevision: -1 }, { automatic: 'yes' }, { event: 'complete' }, { event: 'move_cushion' }]) assert.throws(() => catLifeRequest({ ...input, ...patch }));
});
test('personality is stable per cat; current activity survives a new observation or gentle stroke', () => {
  const state = initialCat('cat-one', now);
  assert.deepEqual(state.temperament, initialCat('cat-one', now + 10000).temperament);
  assert.notDeepEqual(state.temperament, initialCat('cat-two', now).temperament);
  chooseCat(state, input, now, 'sleep_shelter');
  for (const event of ['observe', 'stroke'] as const) {
    const next = advanceCat(state, { ...input, event }, now + 1000, 0);
    assert.equal(next.intent?.id, state.intent?.id);
    assert.deepEqual(catOptions(next, input, now + 1000), {});
  }
});
test('only a completed known activity makes a memory and gradually changes a habit', () => {
  const state = initialCat('cat', now); chooseCat(state, input, now, 'sleep_shelter');
  const event = { ...input, event: 'complete' as const, intentId: state.intent!.id };
  assert.equal(advanceCat(state, event, now + 1000, 0).memories.length, 0);
  assert.equal(advanceCat(state, { ...event, intentId: 'a'.repeat(36) }, now + 100000, 0).memories.length, 0);
  const next = advanceCat(state, event, now + 100000, 0);
  assert.equal(next.memories.length, 1); assert.equal(next.memories[0]!.kind, 'observed');
  assert.ok(next.needs.fatigue < state.needs.fatigue);
  assert.ok(Math.abs(next.preferences.shelter - state.preferences.shelter - 0.015) < 0.000001);
  assert.deepEqual(next.temperament, state.temperament);
  assert.equal(advanceCat(next, event, now + 101000, 0).memories.length, 1);
});
test('repeated handling lets a sensitive cat leave; moving a cushion does not wake a sleeper', () => {
  let state = initialCat('cat', now); state.temperament.sensitivity = 0.75;
  chooseCat(state, input, now, 'sleep_shelter');
  assert.equal(advanceCat(state, { ...input, event: 'move_cushion', target: 'sunny' }, now + 1, 0).intent?.id, state.intent!.id);
  for (let i = 1; i <= 5; i++) state = advanceCat(state, { ...input, event: 'stroke' }, now + i * 1000, 0);
  chooseCat(state, input, now + 5000);
  assert.equal(state.intent?.activity, 'retreat');
});
test('an invitation survives until an activity finishes and expires without rewriting personality', () => {
  const state = initialCat('cat', now); chooseCat(state, input, now, 'sleep_shelter');
  const invited = advanceCat(state, { ...input, event: 'invite', target: 'sunny' }, now + 1000, 0);
  assert.equal(invited.intent?.id, state.intent!.id); assert.equal(invited.invitation?.spot, 'sunny');
  const awake = advanceCat(invited, { ...input, event: 'complete', intentId: state.intent!.id }, now + 100000, 0);
  assert.ok(catOptions(awake, input, now + 100000).sniff_sunny);
  assert.equal(advanceCat(invited, input, now + 121001, 0).invitation, null);
});
test('away simulation is bounded, self sufficient and respects paused activity and trips', () => {
  const state = initialCat('cat', now);
  const away = advanceCat(state, input, now + 7 * 86400000, 0);
  assert.equal(away.memories.length, 3); assert.ok(away.memories.every(m => m.kind === 'away'));
  assert.ok(away.needs.hunger < 0.7); assert.ok(away.needs.fatigue < 0.7);
  const paused = { ...state, automatic: false };
  assert.equal(advanceCat(paused, { ...input, automatic: false }, now + 86400000, 0).memories.length, 0);
  assert.equal(advanceCat(state, input, now + 86400000, now + 86400000).memories.length, 0);
});
test('Jev accepts only a confident, typed choice from available actions', () => {
  const options = catOptions(initialCat('cat', now), input, now), choice = Object.keys(options)[0]!;
  const answer = { type: 'choice', choice, confidence: 0.9, probabilities: Object.fromEntries(Object.keys(options).map(k => [k, k === choice ? 1 : 0])) };
  assert.equal(jevChoice({ answers: { activity: answer } }, options), choice);
  for (const patch of [{ choice: 'transfer_money' }, { confidence: 0.1 }, { confidence: NaN }, { type: 'text' }, { probabilities: {} }]) assert.equal(jevChoice({ answers: { activity: { ...answer, ...patch } } }, options), undefined);
});
test('Jev calls share one in-flight request, omit identity, cap cost and fail locally', async () => {
  const state = initialCat('cat', now), options = catOptions(state, input, now), choice = Object.keys(options)[0]!;
  let release!: () => void, calls = 0;
  const transport: typeof fetch = async (_url, init) => {
    calls++; assert.equal(init?.redirect, 'error');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, 'jev-1.14'); assert.equal(JSON.stringify(body).includes('private-pet-id'), false);
    assert.deepEqual(Object.keys(body.questions.activity.criteria).sort(), Object.keys(options).sort());
    await new Promise<void>(resolve => { release = resolve; });
    return new Response(JSON.stringify({ answers: { activity: { type: 'choice', choice, confidence: 1, probabilities: Object.fromEntries(Object.keys(options).map(k => [k, k === choice ? 1 : 0])) } } }));
  };
  const client = new JevDecisions({ baseUrl: 'https://example.test/v1', apiKey: 'not-a-key', model: 'jev-1.14', dailyCalls: 1 }, transport);
  const a = client.decide('private-pet-id', 0, state, 'observe', options, now);
  const b = client.decide('private-pet-id', 0, state, 'observe', options, now);
  assert.equal(calls, 1); release(); assert.deepEqual(await Promise.all([a, b]), [choice, choice]);
  assert.equal(await client.decide('private-pet-id', 1, state, 'observe', options, now + 60000), undefined);
  const failing = new JevDecisions({ baseUrl: 'https://example.test/v1', apiKey: 'not-a-key', model: 'jev-1.14', dailyCalls: 1 }, async () => { throw new Error('timeout'); });
  assert.equal(await failing.decide('cat', 0, state, 'observe', options, now), undefined);
});
test('Jev configuration rejects partial, insecure and unsupported settings explicitly', () => {
  const env = { NODE_ENV: 'test', DATABASE_URL: 'postgresql://localhost/wanpet_test', CLIENT_ORIGIN: 'http://localhost:5173' };
  assert.equal(loadConfig(env).jev, undefined);
  assert.equal(loadConfig({ ...env, TOKEN_HUB_API_KEY: 'private' }).jev?.model, 'jev-1.14');
  for (const patch of [{ PET_LIFE_MODEL: 'jev-1.14' }, { TOKEN_HUB_API_KEY: 'private', TOKEN_HUB_API_BASE_URL: 'http://example.test/v1' }, { TOKEN_HUB_API_KEY: 'private', PET_LIFE_MODEL: 'chat' }, { TOKEN_HUB_API_KEY: 'private', PET_LIFE_DAILY_CALLS: 'unlimited' }]) assert.throws(() => loadConfig({ ...env, ...patch }));
});
