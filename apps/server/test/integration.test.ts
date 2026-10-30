import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/bootstrap';
import { loadConfig } from '../src/config';
import { Database, MIGRATION } from '../src/database';
import { digest } from '../src/security';
import { GameService } from '../src/service';

const url = process.env.TEST_DATABASE_URL;
if (!url || !/^wanpet_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname.slice(1))) throw new Error('TEST_DATABASE_URL must name an isolated wanpet_test database');
const secret = 'correct test password 123';
const prefix = 't' + randomUUID().replaceAll('-', '').slice(0, 12);

test('PostgreSQL and HTTP acceptance', async t => {
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: url, PORT: '0', CLIENT_ORIGIN: 'http://localhost:5173' });
  const app = await createApp(config); await app.listen(0, '127.0.0.1');
  const service = app.get(GameService); const db = app.get(Database);
  const base = await app.getUrl();
  const request = async (path: string, method = 'GET', data?: unknown, accessToken?: string, key?: string) => {
    const result = await fetch(`${base}/v1/${path}`, { method, headers: { ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(key ? { 'Idempotency-Key': key } : {}) }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
    const text = await result.text();
    return { status: result.status, body: text ? JSON.parse(text) : null, headers: result.headers };
  };
  let auth: Awaited<ReturnType<GameService['register']>>;
  let identity: Awaited<ReturnType<GameService['authenticate']>>;
  let recoveredToken = '';
  let originalPlayer = '';
  let originalPet = '';
  try {
    await t.test('health/readiness and strict HTTP validation', async () => {
      assert.equal((await request('health')).status, 200);
      assert.equal((await request('ready')).status, 200);
      assert.equal((await request('me/snapshot')).status, 401);
      assert.equal((await request('me/initialize', 'POST', {})).status, 401);
      const invalid = await request('auth/register', 'POST', { username: 'short', password: 'short', playerId: 'injected' });
      assert.equal(invalid.status, 400); assert.equal(invalid.body.code, 'INVALID_INPUT'); assert.ok(invalid.body.requestId);
      const origin = await fetch(`${base}/v1/health`, { headers: { Origin: 'https://untrusted.example' } }); assert.equal(origin.status, 403);
      const media = await fetch(`${base}/v1/auth/login`, { method: 'POST', body: '{}' }); assert.equal(media.status, 415);
      const oversized = await fetch(`${base}/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'x'.repeat(17000) }) }); assert.equal(oversized.status, 413);
      const malformed = await fetch(`${base}/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }); assert.equal(malformed.status, 400);
      const preflight = await fetch(`${base}/v1/me/initialize`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,idempotency-key,content-type' } }); assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    });
    await t.test('registration canonicalizes emails; concurrent duplicates cannot create another account', async () => {
      const result = await request('auth/register', 'POST', { email: `  ${prefix.toUpperCase()}@EXAMPLE.TEST  `, username: ' 小家 ', password: secret });
      assert.equal(result.status, 201); auth = result.body;
      assert.equal(auth.account.username, '小家'); assert.equal(auth.account.email, prefix+'@example.test'); assert.equal(auth.expiresAt,null); assert.equal(result.headers.get('cache-control'), 'no-store');
      identity = await service.authenticate(`Bearer ${auth.accessToken}`);
      const [one, two] = await Promise.allSettled([service.register((prefix + 'race') + "@example.test", prefix + 'race', secret), service.register((prefix + 'race') + "@example.test", prefix + 'race', secret)]);
      assert.equal([one, two].filter(r => r.status === 'fulfilled').length, 1);
      assert.equal([one, two].filter(r => r.status === 'rejected' && r.reason.getStatus() === 409).length, 1);
      assert.equal(await db.player.count({ where: { accountId: auth.account.id } }), 0);
      assert.equal((await request('me/snapshot', 'GET', undefined, auth.accessToken)).body.code, 'PLAYER_NOT_INITIALIZED');
      assert.equal((await request('me/initialize', 'POST', {}, auth.accessToken)).status, 400);
      const stored = await db.session.findUniqueOrThrow({ where: { id: identity.sessionId } }); assert.equal(stored.tokenHash, digest(auth.accessToken)); assert.ok(!JSON.stringify(stored).includes(auth.accessToken));
      assert.equal(stored.expiresAt,null);
      await db.session.update({where:{id:identity.sessionId},data:{createdAt:new Date('2000-01-01')}});
      const restored=await request('auth/session','GET',undefined,auth.accessToken);
      assert.equal(restored.status,200);assert.deepEqual(restored.body.account,auth.account);assert.equal(restored.body.expiresAt,null);assert.equal(restored.body.accessToken,undefined);
      const duplicate=await request('auth/register','POST',{email:` ${prefix.toUpperCase()}@EXAMPLE.TEST `,username:'另一个称呼',password:secret});
      assert.equal(duplicate.status,409);assert.equal(duplicate.body.code,'EMAIL_TAKEN');
      const sameName=await request('auth/register','POST',{email:prefix+'same@example.test',username:'小家',password:'123456789'});
      assert.equal(sameName.status,201);assert.notEqual(sameName.body.account.id,auth.account.id);assert.equal(sameName.body.account.username,'小家');
    });
    await t.test('100 concurrent initializations grant exactly once, retries replay response', async () => {
      const results = await Promise.all(Array.from({ length: 100 }, (_, i) => request('me/initialize', 'POST', {}, auth.accessToken, i < 50 ? 'shared' : `key_${i}`)));
      for (const result of results) assert.ok([200, 201].includes(result.status), JSON.stringify(result.body));
      assert.equal(new Set(results.map(r => r.body.player.id)).size, 1);
      const original = results[0]!;
      const replay = await request('me/initialize', 'POST', {}, auth.accessToken, 'shared'); assert.equal(replay.status, original.status); assert.deepEqual(replay.body, original.body);
      const snapshot = (await request('me/snapshot', 'GET', undefined, auth.accessToken)).body;
      assert.deepEqual(snapshot.inventory, [{ itemId: 'test_food', quantity: 3 }, { itemId: 'test_supply', quantity: 1 }]); originalPlayer = snapshot.player.id; originalPet = snapshot.pet.id;
      assert.equal(snapshot.revision, 1); assert.equal(snapshot.pet.speciesId, 'test_species'); assert.equal(snapshot.activeTrip, null);
      assert.equal(await db.player.count({ where: { accountId: auth.account.id } }), 1);
      assert.equal(await db.pet.count({ where: { playerId: snapshot.player.id } }), 1); assert.equal(await db.starterGrant.count({ where: { playerId: snapshot.player.id } }), 1);
      await db.idempotencyRecord.update({ where: { accountId_operation_key: { accountId: auth.account.id, operation: 'initialize', key: 'shared' } }, data: { requestHash: digest('different') } });
      assert.equal((await request('me/initialize', 'POST', {}, auth.accessToken, 'shared')).body.code, 'IDEMPOTENCY_CONFLICT');
    });
    await t.test('failure halfway through initialization rolls all rows back; retry succeeds', async () => {
      const other = await service.register((prefix + 'rollback') + "@example.test", prefix + 'rollback', secret); const id = await service.authenticate(`Bearer ${other.accessToken}`);
      await db.$executeRaw`CREATE FUNCTION wanpet_test_fail_grant() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''test rollback''; END'`;
      await db.$executeRaw`CREATE TRIGGER wanpet_test_fail_grant BEFORE INSERT ON "StarterGrant" FOR EACH ROW EXECUTE FUNCTION wanpet_test_fail_grant()`;
      try { await assert.rejects(service.initialize(id, 'rollback')); assert.equal(await db.player.count({ where: { accountId: id.accountId } }), 0); assert.equal(await db.idempotencyRecord.count({ where: { accountId: id.accountId } }), 0); }
      finally { await db.$executeRaw`DROP TRIGGER wanpet_test_fail_grant ON "StarterGrant"`; await db.$executeRaw`DROP FUNCTION wanpet_test_fail_grant()`; }
      assert.equal((await service.initialize(id, 'rollback')).status, 201);
      await assert.rejects(db.inventory.updateMany({ where: { player: { accountId: id.accountId } }, data: { quantity: -1 } }));
      assert.deepEqual((await service.snapshot(id)).inventory.map(v => v.quantity), [3, 1]);
    });
    await t.test('ownership cannot be selected by input; keys are isolated per account', async () => {
      const other = await service.register((prefix + 'other') + "@example.test", prefix + 'other', secret); const id = await service.authenticate(`Bearer ${other.accessToken}`);
      const initialized = await service.initialize(id, 'key_50'); assert.notEqual(initialized.snapshot.player.id, (await service.snapshot(identity)).player.id);
      const self = await request(`me/snapshot?playerId=${initialized.snapshot.player.id}`, 'GET', undefined, auth.accessToken); assert.notEqual(self.body.player.id, initialized.snapshot.player.id);
      assert.equal((await request('me/initialize', 'POST', { playerId: initialized.snapshot.player.id }, auth.accessToken, 'forged')).status, 400);
    });
    await t.test('readiness rejects missing migration, health stays live', async () => {
      await db.$executeRaw`UPDATE "_prisma_migrations" SET migration_name = 'test_hidden' WHERE migration_name = ${MIGRATION}`;
      try { assert.equal((await request('ready')).status, 503); assert.equal((await request('health')).status, 200); }
      finally { await db.$executeRaw`UPDATE "_prisma_migrations" SET migration_name = ${MIGRATION} WHERE migration_name = 'test_hidden'`; }
    });
    await t.test('login failures are generic, expiry and logout revoke access', async () => {
      const bad = await request('auth/login', 'POST', { email: prefix+'@example.test', password: 'a different long password' });
      const absent = await request('auth/login', 'POST', { email: prefix+'absent@example.test', password: secret });
      assert.equal(bad.status, 401); assert.equal(bad.body.code, absent.body.code); assert.equal(bad.body.message, absent.body.message);
      const login = await request('auth/login', 'POST', { email: prefix+'@example.test', password: secret }); assert.equal(login.status, 200);
      const id = await service.authenticate(`Bearer ${login.body.accessToken}`);
      await db.session.update({ where: { id: id.sessionId }, data: { expiresAt: new Date('2000-01-01') } });
      assert.equal((await request('me/snapshot', 'GET', undefined, login.body.accessToken)).status, 401);
      const fresh = await service.login((prefix) + "@example.test", secret);
      assert.equal((await request('auth/logout', 'POST', {}, fresh.accessToken)).status, 204);
      assert.equal((await request('me/snapshot', 'GET', undefined, fresh.accessToken)).status, 401);
    });
    await t.test('password change revokes every session; old password no longer works', async () => {
      const another = await service.login((prefix) + "@example.test", secret);
      assert.equal((await request('auth/password', 'PUT', { currentPassword: secret, newPassword: 'changed test password 456' }, auth.accessToken)).status, 204);
      for (const accessToken of [auth.accessToken, another.accessToken]) assert.equal((await request('me/snapshot', 'GET', undefined, accessToken)).status, 401);
      await assert.rejects(service.login((prefix) + "@example.test", secret));
      const changed = await service.login((prefix) + "@example.test", 'changed test password 456'); recoveredToken = changed.accessToken;
      assert.equal((await request('me/snapshot', 'GET', undefined, changed.accessToken)).body.revision, 1);
    });
    await t.test('HTTP authentication limits expose retry-after', async () => {
      let response;
      for (let i = 0; i < 6; i++) response = await request('auth/login', 'POST', { email: prefix+'missing@example.test', password: secret });
      assert.equal(response!.status, 429); assert.ok(Number(response!.headers.get('retry-after')) > 0);
    });
  } finally { await app.close(); }
  await t.test('restart preserves sessions, pet identity and inventory', async () => {
    const restarted = await createApp(config); await restarted.listen(0, '127.0.0.1');
    try {
      const root = await restarted.getUrl();
      const response = await fetch(`${root}/v1/me/snapshot`, { headers: { Authorization: `Bearer ${recoveredToken}` } });
      assert.equal(response.status, 200); const snapshot: any = await response.json();
      assert.equal(snapshot.player.id, originalPlayer); assert.equal(snapshot.pet.id, originalPet); assert.equal(snapshot.revision, 1);
      assert.deepEqual(snapshot.inventory.map((v: any) => v.quantity), [3, 1]);
    } finally { await restarted.close(); }
  });
  await t.test('database outage keeps liveness but fails readiness', async () => {
    const offline = await createApp({ ...config, databaseUrl: 'postgresql://unused:unused@127.0.0.1:1/wanpet_test?connect_timeout=1' });
    await offline.listen(0, '127.0.0.1');
    try { const root = await offline.getUrl(); assert.equal((await fetch(`${root}/v1/health`)).status, 200); assert.equal((await fetch(`${root}/v1/ready`)).status, 503);
      const failure = await fetch(`${root}/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'offlineuser@example.test', password: secret }) });
      assert.equal(failure.status, 503); const error: any = await failure.json(); assert.equal(error.code, 'DATABASE_UNAVAILABLE'); assert.ok(!JSON.stringify(error).includes('unused')); }
    finally { await offline.close(); }
  });
});
