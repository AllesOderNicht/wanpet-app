import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/bootstrap';
import { loadConfig } from '../src/config';
import { Database, databaseNow } from '../src/database';
import { GameService } from '../src/service';
import { ChatService } from '../src/chat-service';
import { CatLifeService } from '../src/cat-life-service';
import { JevDecisions } from '../src/jev';
import { SpeechService } from '../src/speech-service';
import type { AgentRequest } from '../src/pet-agent';
import type { MemoryBackend, StoredMemory } from '../src/memory-gateway';
import { wav } from './chat.test';
const url = process.env.TEST_DATABASE_URL;
if (!url || !/^wanpet_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname.slice(1))) throw new Error('Isolated TEST_DATABASE_URL required');
class Memories implements MemoryBackend {
  values = new Map<string, StoredMemory[]>();
  hook?: () => Promise<void>;
  async search(scope: string) { return this.values.get(scope) ?? []; }
  async extract(scope: string, text: string, sourceTurnId: string) {
    if (this.hook) await this.hook();
    const items = [...(this.values.get(scope) ?? []), { id: randomUUID(), memory: text, metadata: { sourceTurnId } }]; this.values.set(scope, items); return items;
  }
  async rebuild(scope: string, items: Array<{ id: string; text: string; sourceTurnId: string | null }>) { const result = items.map(i => ({ id: randomUUID(), memory: i.text, metadata: { entryId: i.id, ...(i.sourceTurnId ? { sourceTurnId: i.sourceTurnId } : {}) } })); this.values.set(scope, result); return result; }
  async purge(scope: string) { this.values.delete(scope); }
  close() {}
}
test('pet chat and memory PostgreSQL/HTTP acceptance', async t => {
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: url, PORT: '0', CLIENT_ORIGIN: 'http://localhost:5173', TOKEN_HUB_API_KEY: 'synthetic', PET_CHAT_ENABLED: 'true', MEM0_DATABASE_URL: url, ARK_API_KEY: 'synthetic' });
  let app = await createApp(config); await app.listen(0, '127.0.0.1');
  let game = app.get(GameService), db = app.get(Database), chats = app.get(ChatService), cats = app.get(CatLifeService);
  const mem = new Memories(), prompts: string[] = [];
  let behavior = async (r: AgentRequest) => { prompts.push(r.prompt); await r.text('你好，今天过得怎么样？'); };
  const configure = () => { chats.memory = mem; chats.agent = { run: r => behavior(r) }; app.get(JevDecisions).decide = async () => 'approach_nearby'; };
  configure();
  const auth = await game.register(('chat_' + randomUUID().slice(0, 12).replaceAll('-', '')) + "@example.test", 'chat_' + randomUUID().slice(0, 12).replaceAll('-', ''), 'chat test password 12345');
  const identity = await game.authenticate('Bearer ' + auth.accessToken), initial = (await game.initialize(identity, 'init')).snapshot;
  const other = await game.register(('chat_' + randomUUID().slice(0, 12).replaceAll('-', '')) + "@example.test", 'chat_' + randomUUID().slice(0, 12).replaceAll('-', ''), 'chat test password 12345');
  const http = async (path: string, body?: unknown, token = auth.accessToken, key = randomUUID()) => {
    const r = await fetch((await app.getUrl()) + '/v1/me/pet/' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, 'Idempotency-Key': key }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: r.status, body: await r.json() as any };
  };
  const wait = async (condition: () => Promise<boolean>) => {
    for (let n = 0; n < 300; n++) { await chats.tick(); if (await condition()) return; await new Promise(resolve => setTimeout(resolve, 20)); } throw new Error('Timed out');
  };
  const done = async (id: string) => { await wait(async () => !['queued', 'running'].includes((await db.chatTurn.findUniqueOrThrow({ where: { id } })).status)); return db.chatTurn.findUniqueOrThrow({ where: { id } }); };
  const send = async (text: string) => (await chats.submit(identity, randomUUID(), { text, surface: 'interior' })).body.id;
  try {
    await t.test('authentication, validation and deduplicated concurrent sends', async () => {
      assert.equal((await http('chat', undefined, '')).status, 401);
      assert.equal((await http('chat', { text: 'hi', surface: 'interior', accountId: other.account.id })).status, 400);
      const key = randomUUID();
      const results = await Promise.all(Array.from({ length: 25 }, () => chats.submit(identity, key, { text: '我喜欢蓝莓', surface: 'interior' })));
      assert.equal(new Set(results.map(r => r.body.id)).size, 1);
      await done(results[0].body.id);
      assert.equal(await db.chatTurn.count({ where: { petId: initial.pet.id } }), 1);
      assert.equal((await http(`chat/${results[0].body.id}/events`, undefined, other.accessToken)).status, 404);
      await assert.rejects(chats.submit(identity, key, { text: 'different', surface: 'interior' }));
      assert.deepEqual((await game.snapshot(identity)).inventory, initial.inventory);
    });
    await t.test('cross-turn context, source-linked memory, and account isolation', async () => {
      await wait(async () => (await chats.memories(identity)).items.length > 0);
      const id = await send('你记得我喜欢什么吗？'); await done(id);
      assert.match(prompts.at(-1)!, /蓝莓/);
      const memories = await chats.memories(identity); assert.ok(memories.items[0].sourceTurnId);
      assert.equal((await http(`memories/${memories.items[0].id}/delete`, {}, other.accessToken)).status, 409);
    });
    await t.test('a failed reply retry cannot execute a second pet action', async () => {
      behavior = async r => { await r.tool('invite_pet', { activity: 'approach' }); throw new Error('synthetic model failure'); };
      const id = await send('过来陪我'); const failed = await done(id); assert.equal(failed.status, 'failed');
      const invitation = failed.invitation as any; assert.equal(invitation.outcome, 'accepted');
      const revision = (await cats.view(identity)).revision;
      behavior = async r => { const result = await r.tool('invite_pet', { activity: 'sleep' }) as any; assert.equal(result.activity, 'approach'); await r.text('我已经接受了刚才的靠近邀请。'); };
      await chats.control(identity, randomUUID(), id, 'retry'); assert.equal((await done(id)).status, 'completed');
      assert.equal((await cats.view(identity)).revision, revision);
      const started = await http('life', { protocolVersion: 2, surface: 'interior', event: 'started', automatic: true, intentId: invitation.intentId, expectedRevision: revision, target: null });
      assert.equal(started.status, 200);
      assert.equal(((await db.chatTurn.findUniqueOrThrow({ where: { id } })).invitation as any).stage, 'started');
      let row = await db.petLife.findUniqueOrThrow({ where: { petId: initial.pet.id } }), state = row.state as any;
      state.intent.startedAt = new Date((await databaseNow(db)).getTime() - (state.intent.durationSeconds + 2) * 1000).toISOString();
      await db.petLife.update({ where: { petId: initial.pet.id }, data: { state } });
      const arrived = await http('life', { protocolVersion: 2, surface: 'interior', event: 'arrived', automatic: true, intentId: invitation.intentId, expectedRevision: row.revision, target: null });
      assert.equal(arrived.status, 200); assert.equal(arrived.body.intent.id, invitation.intentId); assert.equal(arrived.body.intent.stage, 'using');
      row = await db.petLife.findUniqueOrThrow({ where: { petId: initial.pet.id } }); state = row.state as any;
      state.intent.usingAt = new Date((await databaseNow(db)).getTime() - (state.intent.durationSeconds + 1) * 1000).toISOString();
      await db.petLife.update({ where: { petId: initial.pet.id }, data: { state } });
      await cats.advance(identity, randomUUID(), { protocolVersion: 2, surface: 'interior', event: 'complete', automatic: true, intentId: invitation.intentId, expectedRevision: row.revision, target: null });
      assert.equal(((await db.chatTurn.findUniqueOrThrow({ where: { id } })).invitation as any).stage, 'completed');
    });
    await t.test('stopping before a delayed tool prevents mutation', async () => {
      let release!: () => void, entered = false;
      behavior = async r => { assert.ok(JSON.parse(r.prompt).history.some((turn: any) => turn.invitation?.stage === 'completed')); entered = true; await new Promise<void>(resolve => { release = resolve; }); await r.tool('invite_pet', { activity: 'rest' }); };
      const before = (await cats.view(identity)).revision, id = await send('等一下再休息');
      await wait(async () => entered);
      await chats.control(identity, randomUUID(), id, 'stop'); release();
      await new Promise(resolve => setTimeout(resolve, 50));
      assert.equal((await db.chatTurn.findUniqueOrThrow({ where: { id } })).status, 'cancelled'); assert.equal((await cats.view(identity)).revision, before);
    });
    await t.test('an experience arriving during extraction remains queued for another extraction', async () => {
      await wait(async () => (await db.memoryTask.count({ where: { turn: { petId: initial.pet.id } } })) === 0);
      let entered = false, calls = 0, release!: () => void;
      mem.hook = async () => { calls++; if (calls === 1) { entered = true; await new Promise<void>(resolve => { release = resolve; }); } };
      behavior = async r => { await r.text('收到'); };
      const id = await send('今天一起休息'); await done(id); await wait(async () => entered);
      await db.memoryTask.update({ where: { turnId: id }, data: { generation: { increment: 1 } } });
      release(); await wait(async () => calls === 2);
      await wait(async () => !(await db.memoryTask.findUnique({ where: { turnId: id } })));
      mem.hook = undefined;
      assert.equal((await db.chatTurn.findUniqueOrThrow({ where: { id } })).memoryStatus, 'ready');
    });
    await t.test('a malformed provider snapshot cannot erase saved memories', async () => {
      const before = await chats.memories(identity), room = await db.chatRoom.findUniqueOrThrow({ where: { petId: initial.pet.id } });
      assert.ok(before.items.length);
      await assert.rejects((chats as any).syncMemories(initial.pet.id, room.epoch, [{ id: 'broken', memory: null }]));
      assert.deepEqual((await chats.memories(identity)).items, before.items);
    });
    await t.test('deletion invalidates in-flight extraction and old conversation context', async () => {
      await wait(async () => (await db.memoryTask.count()) === 0);
      let entered = false, release!: () => void;
      mem.hook = async () => { entered = true; await new Promise<void>(resolve => { release = resolve; }); };
      behavior = async r => { prompts.push(r.prompt); await r.text('收到'); };
      const id = await send('被删除的偏好：喜欢紫色'); await done(id); await wait(async () => entered);
      await chats.manageMemory(identity, randomUUID(), 'clear'); mem.hook = undefined; release();
      await wait(async () => !(await db.chatRoom.findUniqueOrThrow({ where: { petId: initial.pet.id } })).needsReindex);
      assert.equal((await chats.memories(identity)).items.length, 0);
      const next = await send('现在重新聊聊'); await done(next); assert.doesNotMatch(prompts.at(-1)!, /蓝莓|紫色/);
    });
    await t.test('corrected memory is reindexed and source history can be independently deleted', async () => {
      await wait(async () => (await chats.memories(identity)).items.length > 0);
      const item = (await chats.memories(identity)).items[0];
      await assert.rejects(chats.manageMemory(identity, randomUUID(), 'update', item.id, '我的密码是 synthetic-only'));
      await chats.manageMemory(identity, randomUUID(), 'update', item.id, '主人喜欢苹果');
      await wait(async () => !(await db.chatRoom.findUniqueOrThrow({ where: { petId: initial.pet.id } })).needsReindex);
      const id = await send('我喜欢什么'); await done(id); assert.match(prompts.at(-1)!, /苹果/);
      await chats.control(identity, randomUUID(), id, 'delete');
      assert.equal((await http(`chat/${id}/events`)).status, 404);
      assert.equal((await db.chatTurn.findUniqueOrThrow({ where: { id } })).userText, '');
    });
    await t.test('voice is disabled until configured, then mock transcription stays separate from chat', async () => {
      assert.equal((await http('speech', { audio: wav().toString('base64') })).body.code, 'ASR_NOT_CONFIGURED');
      const speech = app.get(SpeechService); speech.transcribe = async () => '过来陪我';
      const count = await db.chatTurn.count();
      const key = randomUUID(), first = await http('speech', { audio: wav().toString('base64') }, auth.accessToken, key);
      assert.equal(first.status, 202); assert.equal((await http('speech', { audio: wav().toString('base64') }, auth.accessToken, key)).body.id, first.body.id);
      await wait(async () => (await speech.get(identity, first.body.id)).status === 'completed');
      assert.equal((await speech.get(identity, first.body.id)).text, '过来陪我'); assert.equal(await db.chatTurn.count(), count);
      assert.equal((await http(`speech/${first.body.id}`, undefined, other.accessToken)).status, 404);
    });
    await t.test('urgent needs can decline an invitation and a newer life revision defers it', async () => {
      const row = await db.petLife.findUniqueOrThrow({ where: { petId: initial.pet.id } });
      const state = row.state as any; state.intent = null; state.needs.fatigue = 1;
      await db.petLife.update({ where: { petId: initial.pet.id }, data: { state } });
      behavior = async r => { await r.tool('invite_pet', { activity: 'approach' }); await r.text('按真实结果回应'); };
      const declined = await done(await send('可以靠近我吗')); assert.equal((declined.invitation as any).outcome, 'declined');
      state.needs.fatigue = .2; state.intent = null;
      await db.petLife.update({ where: { petId: initial.pet.id }, data: { state } });
      const revision = (await cats.view(identity)).revision;
      app.get(JevDecisions).decide = async () => { await db.petLife.update({ where: { petId: initial.pet.id }, data: { revision: { increment: 1 } } }); return 'approach_nearby'; };
      const deferred = await done(await send('再邀请靠近')); assert.equal((deferred.invitation as any).outcome, 'deferred');
      assert.equal((await cats.view(identity)).revision, revision + 1);
      configure();
      state.intent = null; await db.petLife.update({ where: { petId: initial.pet.id }, data: { state } });
      const accepted = await done(await send('这次重新邀请靠近')); assert.equal((accepted.invitation as any).outcome, 'accepted');
      const sameActivity = await done(await send('它已经在靠近时再邀请')); assert.equal((sameActivity.invitation as any).outcome, 'deferred');
      const life = await cats.view(identity);
      await cats.advance(identity, randomUUID(), { surface: 'courtyard', event: 'observe', automatic: true, intentId: null, expectedRevision: life.revision, target: null });
      assert.equal(((await db.chatTurn.findUniqueOrThrow({ where: { id: accepted.id } })).invitation as any).stage, 'blocked');
    });
    await t.test('travel allows conversation but rejects home invitations without changing inventory', async () => {
      const snapshot = await game.snapshot(identity);
      await game.startTrip(identity, randomUUID(), { loadoutItemIds: ['test_food'], expectedRevision: snapshot.revision });
      const inventory = (await game.snapshot(identity)).inventory;
      behavior = async r => { const result = await r.tool('invite_pet', { activity: 'approach' }) as any; assert.equal(result.outcome, 'unavailable'); await r.text('旅途中可以聊天，回家后再靠近。'); };
      const turn = await done(await send('旅行时可以陪我聊聊吗')); assert.equal(turn.status, 'completed');
      assert.equal((turn.invitation as any).outcome, 'unavailable'); assert.deepEqual((await game.snapshot(identity)).inventory, inventory);
    });
    await t.test('restart preserves history and marks abandoned work without replaying tools', async () => {
      const id = await send('重启测试');
      await db.chatTurn.update({ where: { id }, data: { status: 'running', updatedAt: new Date(Date.now() - 150000) } });
      await app.close(); app = await createApp(config); await app.listen(0, '127.0.0.1');
      game = app.get(GameService); db = app.get(Database); cats = app.get(CatLifeService); chats = app.get(ChatService); configure();
      await chats.tick(); assert.equal((await db.chatTurn.findUniqueOrThrow({ where: { id } })).error, 'CHAT_INTERRUPTED');
      assert.ok((await chats.history(identity)).turns.length > 1);
    });
  } finally { await app.close(); }
});
