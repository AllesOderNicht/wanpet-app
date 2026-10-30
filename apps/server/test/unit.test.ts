import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config';
import { digest, idempotencyKey, object, password, Passwords, RateLimits, username, email } from '../src/security';
import { rollTripRewards, startTripRequest, storedRewards, TEST_TRIP, tripId, tripView } from '../src/travel';

test('configuration validates secrets without including them in errors', () => {
  const env = { NODE_ENV: 'test', DATABASE_URL: 'postgresql://user:private@localhost/wanpet_test', CLIENT_ORIGIN: 'http://localhost:5173', PORT: '0' };
  assert.equal(loadConfig(env).port, 0);
  for (const patch of [{ DATABASE_URL: '' }, { PORT: 'NaN' }, { HOST: '0.0.0.0' }, { CLIENT_ORIGIN: '*' }, { CLIENT_ORIGIN: 'http://public.example' }, { NODE_ENV: '' }]) assert.throws(() => loadConfig({ ...env, ...patch }));
  const memory = { ...env, TOKEN_HUB_API_KEY: 'test-chat', PET_CHAT_ENABLED: 'true', MEM0_DATABASE_URL: 'postgresql://localhost/memory' };
  assert.throws(() => loadConfig(memory), /HUOSHAN_API_KEY or ARK_API_KEY/);
  assert.equal(loadConfig({ ...memory, HUOSHAN_API_KEY: 'test-ark' }).memory?.apiKey, 'test-ark');
  assert.equal(loadConfig({ ...memory, ARK_API_KEY: 'test-ark-alias' }).memory?.apiKey, 'test-ark-alias');
});
test('runtime validation handles canonical identity, Unicode passwords and unknown fields', () => {
  assert.equal(username('  小家 '), '小家');
  assert.equal(username(' Alice_12 '),'Alice_12');
  assert.equal(email('  ALICE@Example.TEST '),'alice@example.test');
  for (const value of ['', 'a@', 'a..b@example.test', 'a@-example.test', 'a@b', {}, null]) assert.throws(()=>email(value));
  for (const value of ['x'.repeat(8), '🐈'.repeat(8)]) assert.throws(()=>password(value));
  for (const value of ['x'.repeat(9), '🐈'.repeat(9), 'x'.repeat(128)]) assert.equal(password(value),value);
  for (const value of ['', '  ', 'a\nname', 'a'.repeat(33), {}, null]) assert.throws(() => username(value));
  assert.equal(password(' '.repeat(15)), ' '.repeat(15));
  assert.equal(password('🐈'.repeat(128)), '🐈'.repeat(128));
  for (const value of ['short', 'x'.repeat(129), '🐈'.repeat(129), '\uD800'.repeat(15), {}, null]) assert.throws(() => password(value));
  assert.deepEqual(object({}, []), {});
  for (const value of [[], null, { playerId: 'forged' }, Object.create({ username: 'inherited' })]) assert.throws(() => object(value, ['username']));
  assert.equal(idempotencyKey('a-B_123'), 'a-B_123');
  assert.throws(() => idempotencyKey('with spaces'));
});
test('rate limits expire, isolate keys and return retry-after', () => {
  const limiter = new RateLimits();
  limiter.take('a', 1, 1000, 0);
  assert.throws(() => limiter.take('a', 1, 1000, 500), (e: any) => e.getStatus() === 429 && e.retryAfter === 1);
  limiter.take('b', 1, 1000, 500);
  limiter.take('a', 1, 1000, 1000);
});
test('password salts differ, verification rejects mismatches, hash queue is bounded', async () => {
  const passwords = new Passwords(); await passwords.dummy;
  const a = await passwords.hash('a sufficiently long password');
  const b = await passwords.hash('a sufficiently long password');
  assert.notEqual(a, b);
  assert.equal(await passwords.verify('a sufficiently long password', a), true);
  assert.equal(await passwords.verify('a sufficiently wrong password', a), false);
  assert.equal(digest('secret').length, 64);
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => passwords.hash('a sufficiently long password')));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 9);
  assert.equal(results.filter(r => r.status === 'rejected' && r.reason.getStatus() === 503).length, 1);
});
test('trip input is bounded, canonicalized and rejects client-owned outcomes', () => {
  const input = { loadoutItemIds: ['test_supply', 'test_food'], expectedRevision: 1 };
  assert.deepEqual(startTripRequest(input), { loadoutItemIds: ['test_food', 'test_supply'], expectedRevision: 1 });
  assert.deepEqual(input.loadoutItemIds, ['test_supply', 'test_food']);
  for (const patch of [
    { loadoutItemIds: [] }, { loadoutItemIds: ['test_food', 'test_food'] }, { loadoutItemIds: ['bento'] },
    { loadoutItemIds: Array(4).fill('test_food') }, { loadoutItemIds: [null] },
    { expectedRevision: 0 }, { expectedRevision: 1.5 }, { expectedRevision: NaN }, { expectedRevision: '1' },
    { expectedRevision: 2147483648 }, { playerId: 'forged' }, { returnAt: '2000-01-01' }, { rewards: [] },
  ]) assert.throws(() => startTripRequest({ ...input, ...patch }));
  assert.equal(tripId('ABCDEF12-ABCD-1234-5678-ABCDEF123456'), 'abcdef12-abcd-1234-5678-abcdef123456');
  for (const id of [null, '../secret', "' OR true --", 'short']) assert.throws(() => tripId(id));
});
test('stored reward metadata survives config changes and rejects corrupt data', () => {
  const legacy = [{ itemId: 'legacy_postcard', quantity: 2, collectible: true }];
  assert.deepEqual(storedRewards(legacy), legacy);
  for (const value of [null, [], [{ itemId: 'x', quantity: -1, collectible: true }], [{ itemId: 'x', quantity: 1.5, collectible: true }], [{ itemId: 'x', quantity: 1 }], [...legacy, ...legacy]]) assert.throws(() => storedRewards(value));
  for (let i = 0; i < 20; i++) {
    const rewards = rollTripRewards();
    assert.deepEqual(storedRewards(rewards), rewards);
    assert.equal(rewards[0]!.quantity, 1);
    assert.equal(rewards[1]!.collectible, true);
    assert.ok(TEST_TRIP.postcards.some(id => id === rewards[1]!.itemId));
  }
});
test('trip status is derived at the server return boundary without exposing rewards', () => {
  const trip = { id: 'id', configVersion: 'retired-v0', destinationId: 'test', startedAt: new Date(0), returnAt: new Date(60000), claimedAt: null, rewards: ['private'] };
  assert.equal(tripView(trip, new Date(59999)).status, 'TRAVELING');
  assert.equal(tripView(trip, new Date(60000)).status, 'READY_TO_CLAIM');
  assert.equal(tripView({ ...trip, claimedAt: new Date(60001) }, new Date(60001)).status, 'CLAIMED');
  assert.equal('rewards' in tripView(trip, new Date(60000)), false);
});
