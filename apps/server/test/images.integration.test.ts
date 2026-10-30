import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { createApp } from '../src/bootstrap';
import { loadConfig } from '../src/config';
import { GameService, Identity } from '../src/service';
import { ChatService } from '../src/chat-service';
import { ImageService } from '../src/image-service';
import { ImageProvider, ImageProviderError } from '../src/seedream';
import { planPostcard, POSTCARD_STYLE } from '../src/postcard-images';
import type { AgentRequest } from '../src/pet-agent';

const url = process.env.TEST_DATABASE_URL;
if (!url || !/^wanpet_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname.slice(1))) throw new Error('Isolated TEST_DATABASE_URL required');
test('private images, budget ledger, durable generation and postcards', async t => {
  const root = await mkdtemp(join(tmpdir(), 'wanpet-images-integration-'));
  const bytes = await sharp({ create: { width: 320, height: 200, channels: 3, background: '#ac6532' } }).png().toBuffer();
  const reference = join(root, 'reference.png'); await writeFile(reference, bytes);
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: url, PORT: '0', CLIENT_ORIGIN: 'http://localhost:5173', TOKEN_HUB_API_KEY: 'synthetic', PET_CHAT_ENABLED: 'true', PET_MEDIA_DIR: join(root, 'media'), SEEDREAM_API_KEY: 'synthetic', SEEDREAM_MODEL: 'doubao-seedream-test', SEEDREAM_UNIT_PRICE_FEN: '22', PET_IMAGE_REFERENCE_PATH: reference });
  let app = await createApp(config); await app.listen(0, '127.0.0.1');
  let game = app.get(GameService), db = game.db, images = app.get(ImageService), chats = app.get(ChatService);
  let calls = 0, downloads = 0, failDownloads = 0;
  let generate: ImageProvider['generate'] = async () => ({ url: 'https://test.tos-cn-beijing.volces.com/synthetic.jpg' });
  const provider: ImageProvider = { generate: async input => { calls++; return generate(input); }, download: async () => { downloads++; if (failDownloads-- > 0) throw new Error('temporary file failure'); return bytes; } };
  images.provider = provider;
  const budgetCeiling = (await images.budget()).usedFen + 1000; config.images!.dailyBudgetFen = budgetCeiling;
  let behavior = async (r: AgentRequest) => { await r.text('收到。'); };
  chats.agent = { run: r => behavior(r) };
  const owner = await game.register(('img_' + randomUUID().slice(0, 12).replaceAll('-', '')) + "@example.test", 'img_' + randomUUID().slice(0, 12).replaceAll('-', ''), 'images test password 12345');
  const identity = await game.authenticate('Bearer ' + owner.accessToken), initial = (await game.initialize(identity, 'init')).snapshot;
  const other = await game.register(('img_' + randomUUID().slice(0, 12).replaceAll('-', '')) + "@example.test", 'img_' + randomUUID().slice(0, 12).replaceAll('-', ''), 'images test password 12345');
  const outsider = await game.authenticate('Bearer ' + other.accessToken); await game.initialize(outsider, 'init');
  const http = async (path: string, body?: unknown, auth = owner.accessToken, key = randomUUID()) => fetch((await app.getUrl()) + '/v1/me/' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth, 'Idempotency-Key': key }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const wait = async (condition: () => Promise<boolean>) => { for (let i = 0; i < 500; i++) { await chats.tick(); await images.tick(); if (await condition()) return; await new Promise(r => setTimeout(r, 20)); } throw new Error('Timed out'); };
  const send = async (text: string, imageIds: string[] = [], who: Identity = identity) => { const id = (await chats.submit(who, randomUUID(), { text, imageIds, surface: 'interior' })).body.id; await wait(async () => (await db.chatTurn.findUniqueOrThrow({ where: { id } })).status === 'completed'); return id; };
  const jobFor = async (turnId: string) => db.imageJob.findUniqueOrThrow({ where: { turnId } });
  const settled = async (turnId: string) => { await wait(async () => !['queued', 'submitted', 'saving'].includes((await jobFor(turnId)).status)); return jobFor(turnId); };
  const request = async (who = identity) => { behavior = async r => { await r.tool('generate_image', { prompt: '原创猫咪插画', referenceIds: [] }); await r.text('正在绘制。'); }; return send('画一张猫', [], who); };
  let upload = '';
  try {
    await t.test('authenticated decoded uploads replay once and cannot be read or attached by another account', async () => {
      assert.equal((await http('media', { data: bytes.toString('base64') }, '')).status, 401);
      const key = randomUUID(), input = { data: bytes.toString('base64') };
      const uploads = await Promise.all(Array.from({ length: 8 }, () => images.upload(identity, key, input)));
      upload = uploads[0].body.id; assert.equal(new Set(uploads.map(x => x.body.id)).size, 1);
      assert.equal((await http(`media/${upload}/content`, undefined, other.accessToken)).status, 404);
      assert.equal((await http(`media/${upload}/content`)).headers.get('content-type'), 'image/jpeg');
      await assert.rejects(chats.submit(outsider, randomUUID(), { text: '看图', surface: 'interior', imageIds: [upload] }));
      await assert.rejects(images.upload(identity, key, { data: Buffer.from('different').toString('base64') }));
      assert.equal(await db.mediaAsset.count({ where: { accountId: identity.accountId } }), 1);
      const records = await db.idempotencyRecord.findMany({ where: { accountId: identity.accountId, operation: 'image.upload' } });
      assert.ok(!JSON.stringify(records).includes(bytes.toString('base64')));
    });
    await t.test('pictures enter explicit Codex input and never enter the memory extractor', async () => {
      const captured: Array<{ scope: string; text: string; sourceTurnId: string }> = []; config.memory = { databaseUrl: url!, apiKey: 'synthetic' };
      chats.memory = { search: async () => [], extract: async (scope, text, sourceTurnId) => { captured.push({ scope, text, sourceTurnId }); return []; }, rebuild: async () => [], purge: async () => {}, close() {} };
      behavior = async r => { assert.ok(r.images?.length); assert.ok(JSON.parse(r.prompt).images.some((i: any) => i.id === upload)); await r.text('图片里是测试色块。'); };
      const turn = await send('记住这张图里的人和地点', [upload]);
      await wait(async () => !(await db.memoryTask.findUnique({ where: { turnId: turn } })));
      assert.deepEqual(captured.filter(entry => entry.scope.startsWith(initial.pet.id + ':') || entry.sourceTurnId === turn), []);
      behavior = async r => { assert.ok(r.images?.length); await r.text('仍然可以查看近期图片。'); };
      const textTurn = await send('继续看刚才的图片');
      await wait(async () => !(await db.memoryTask.findUnique({ where: { turnId: textTurn } })));
      assert.ok(captured.some(entry => entry.sourceTurnId === textTurn && entry.text === '继续看刚才的图片'));
      assert.ok(captured.every(entry => entry.sourceTurnId !== turn));
      await chats.control(identity, randomUUID(), turn, 'delete');
      assert.equal((await http(`media/${upload}/content`)).status, 404);
      behavior = async r => { assert.equal(r.images?.length, 0); assert.ok(!r.prompt.includes(upload)); await r.text('图片已删除。'); };
      await send('现在还能看到吗'); config.memory = undefined;
    });
    await t.test('proposals require confirmation, and duplicate confirmation generates once', async () => {
      const before = calls;
      behavior = async r => { const denied = await r.tool('generate_image', { prompt: '星空', referenceIds: [] }) as any; assert.equal(denied.status, 'not_authorized'); await r.tool('propose_image', { prompt: '星空下的猫', referenceIds: [] }); await r.text('要画一张吗？'); };
      const turn = await send('今晚的星空真漂亮'), job = await jobFor(turn); assert.equal(job.status, 'proposed'); assert.equal(calls, before);
      assert.equal((await http(`pet/images/${job.id}/confirm`, {}, other.accessToken)).status, 404);
      const key = randomUUID(); await Promise.all(Array.from({ length: 12 }, () => images.control(identity, key, job.id, 'confirm')));
      const done = await settled(turn); assert.equal(done.status, 'completed'); assert.equal(calls, before + 1); assert.ok(done.imageId);
    });
    await t.test('daily gift gate survives retries and refuses reference photos', async () => {
      const make = async (roll: number) => {
        const room = await db.chatRoom.findUniqueOrThrow({ where: { petId: initial.pet.id } });
        return db.chatTurn.create({ data: { petId: room.petId, sessionId: identity.sessionId, epoch: room.epoch, userText: '我梦见星空', status: 'completed', imageRoll: roll } });
      };
      const missed = await make(5);
      assert.equal((await db.$transaction(tx => images.fromTool(tx, missed, identity.accountId, 'gift_image', { prompt: '星空' })) as any).status, 'not_selected');
      const withPhoto = await make(0);
      await db.mediaAsset.create({data:{id:randomUUID(),accountId:identity.accountId,turnId:withPhoto.id,kind:'upload',width:20,height:20,bytes:100}});
      assert.equal((await db.$transaction(tx => images.fromTool(tx, withPhoto, identity.accountId, 'gift_image', {prompt:'星空'})) as any).status, 'not_selected');
      const hit = await make(4); await db.$transaction(tx => images.fromTool(tx, hit, identity.accountId, 'gift_image', { prompt: '星空' }));
      const again = await make(0); assert.equal((await db.$transaction(tx => images.fromTool(tx, again, identity.accountId, 'gift_image', { prompt: '星空' })) as any).status, 'daily_limit');
      await assert.rejects(db.$transaction(tx => images.fromTool(tx, again, identity.accountId, 'gift_image', { prompt: '星空', referenceIds: [upload] })));
      await settled(hit.id);
    });
    await t.test('download failures retry only the existing result, never the paid generation', async () => {
      const before = calls, previousDownloads = downloads; failDownloads = 1;
      const turn = await request(), job = await settled(turn);
      assert.equal(job.status, 'completed'); assert.equal(calls, before + 1); assert.ok(downloads >= previousDownloads + 2);
    });
    await t.test('unknown provider outcome retains the reservation; explicit retry is idempotent and separately charged', async () => {
      const before = calls, spent = (await images.budget()).usedFen;
      generate = async () => { throw new Error('connection lost after upstream accepted'); };
      const turn = await request(), job = await settled(turn); assert.equal(job.status, 'unknown'); assert.equal(calls, before + 1); assert.equal((await images.budget()).usedFen, spent + 22);
      await images.tick(); assert.equal(calls, before + 1);
      generate = async () => ({ url: 'https://test.tos-cn-beijing.volces.com/synthetic.jpg' });
      const key = randomUUID(); await Promise.all(Array.from({ length: 10 }, () => images.control(identity, key, job.id, 'retry')));
      assert.equal((await settled(turn)).status, 'completed'); assert.equal(calls, before + 2); assert.equal((await images.budget()).usedFen, spent + 44);
    });
    await t.test('known pre-inference rejection releases its reservation', async () => {
      const spent = (await images.budget()).usedFen;
      generate = async () => { throw new ImageProviderError('IMAGE_PROVIDER_FAILED', true); };
      const turn = await request(); assert.equal((await settled(turn)).status, 'failed'); assert.equal((await images.budget()).usedFen, spent);
      generate = async () => ({ url: 'https://test.tos-cn-beijing.volces.com/synthetic.jpg' });
    });
    await t.test('deleting context during generation prevents late publication without refunding an accepted image', async () => {
      let release!: () => void, entered = false;
      generate = async () => { entered = true; await new Promise<void>(r => { release = r; }); return { url: 'https://test.tos-cn-beijing.volces.com/synthetic.jpg' }; };
      const turn = await request(); await wait(async () => entered);
      const job = await jobFor(turn); await chats.control(identity, randomUUID(), turn, 'delete'); release();
      await wait(async () => (await db.imageCharge.findUniqueOrThrow({ where: { jobId_attempt: { jobId: job.id, attempt: 1 } } })).status === 'charged');
      assert.equal((await jobFor(turn)).status, 'cancelled'); assert.equal(await db.mediaAsset.count({ where: { id: job.id } }), 0);
      generate = async () => ({ url: 'https://test.tos-cn-beijing.volces.com/synthetic.jpg' });
    });
    await t.test('all accounts share one atomic budget reservation limit', async () => {
      const spent = (await images.budget()).usedFen; config.images!.dailyBudgetFen = spent + 22;
      const before = calls, [first, second] = await Promise.all([request(), request(outsider)]);
      const statuses = [(await settled(first)).status, (await settled(second)).status];
      assert.equal(statuses.filter(s => s === 'completed').length, 1); assert.equal(calls, before + 1); assert.equal((await images.budget()).usedFen, config.images!.dailyBudgetFen);
      config.images!.dailyBudgetFen = budgetCeiling;
    });
    await t.test('strict 10 percent branch, empty pool fallback and appearance-filtered shared reuse', async () => {
      const fixture = async (roll: number, speciesId = 'test_species') => db.$transaction(async tx => {
        const trip = await tx.trip.create({ data: { playerId: initial.player.id, configVersion: 'test', destinationId: 'test_forest', loadout: [], rewards: [], startedAt: new Date(Date.now() - 120000), returnAt: new Date(Date.now() - 60000), claimedAt: new Date(), claimResponse: {} } });
        return planPostcard(tx, { tripId: trip.id, accountId: identity.accountId, petId: initial.pet.id, speciesId, destination: 'fixture_' + identity.accountId, theme: 'test_postcard_forest' }, roll);
      });
      const empty = await fixture(10); assert.equal(empty.status, 'fallback');
      const fresh = await fixture(9); assert.equal(fresh.status, 'queued');
      await wait(async () => (await db.imageJob.findUniqueOrThrow({ where: { id: fresh.id } })).status === 'completed');
      const published = await db.mediaAsset.findUniqueOrThrow({ where: { id: fresh.id } }); assert.equal(published.accountId, null); assert.equal(published.style, POSTCARD_STYLE);
      const reused = await fixture(99); assert.equal(reused.imageId, published.id); assert.equal(reused.status, 'completed');
      assert.equal((await fixture(99, 'orange_cat')).status, 'fallback');
      assert.equal((await http(`media/${published.id}/content`, undefined, other.accessToken)).status, 200);
      const before = calls; await images.tick(); assert.equal(calls, before);
    });
    await t.test('trip departure and claim retries never redraw or block economic rewards', async () => {
      const snapshot = await game.snapshot(identity), key = randomUUID();
      const started = await game.startTrip(identity, key, { loadoutItemIds: ['test_food'], expectedRevision: snapshot.revision });
      const job = await db.imageJob.findUniqueOrThrow({ where: { tripId: started.body.trip.id } });
      assert.ok(!(await images.postcards(identity)).items.some(i => i.tripId === started.body.trip.id));
      const replay = await game.startTrip(identity, key, { loadoutItemIds: ['test_food'], expectedRevision: snapshot.revision }); assert.equal(replay.body.trip.id, started.body.trip.id);
      assert.equal((await db.imageJob.findUniqueOrThrow({ where: { tripId: started.body.trip.id } })).id, job.id);
      await db.imageJob.update({ where: { id: job.id }, data: { status: 'submitted', submittedAt: new Date() } });
      await db.trip.update({ where: { id: started.body.trip.id }, data: { startedAt: new Date(Date.now() - 120000), returnAt: new Date(Date.now() - 60000) } });
      const claimed = await game.claimTrip(identity, randomUUID(), started.body.trip.id);
      const claimedAgain = await game.claimTrip(identity, randomUUID(), started.body.trip.id); assert.deepEqual(claimedAgain.body, claimed.body);
      assert.equal((await db.imageJob.findUniqueOrThrow({ where: { id: job.id } })).status, 'submitted');
      assert.ok((await images.postcards(identity)).items.some(i => i.tripId === started.body.trip.id && i.claimed));
    });
    await t.test('restart never resubmits an accepted task and recovers queued or saved-result work', async () => {
      const turn = await request(); await settled(turn);
      const job = await jobFor(turn);
      await db.imageJob.update({ where: { id: job.id }, data: { status: 'submitted', submittedAt: new Date(Date.now() - 180000) } });
      const before = calls;
      await app.close();
      // Persist fixtures while no worker is running, at the three crash boundaries.
      await db.$connect();
      const room = await db.chatRoom.findUniqueOrThrow({where:{petId:initial.pet.id}});
      const fixture = async (status: string) => {
        const t = await db.chatTurn.create({data:{petId:room.petId,sessionId:identity.sessionId,epoch:room.epoch,userText:'画一张猫',status:'completed'}});
        return db.imageJob.create({data:{accountId:identity.accountId,petId:room.petId,turnId:t.id,epoch:room.epoch,origin:'request',status,prompt:'原创猫咪',...(status==='saving'?{resultUrl:'https://test.volces.com/saved.jpg'}:{})}});
      };
      const queued = await fixture('queued'), saving = await fixture('saving'), previousDownloads = downloads;
      await db.$disconnect();
      app = await createApp(config); await app.listen(0, '127.0.0.1');
      game = app.get(GameService); db = game.db; images = app.get(ImageService); images.provider = provider; chats = app.get(ChatService); chats.agent = { run: r => behavior(r) };
      await images.tick(); assert.equal((await db.imageJob.findUniqueOrThrow({ where: { id: job.id } })).status, 'unknown');
      await wait(async () => await db.imageJob.count({where:{id:{in:[queued.id,saving.id]},status:'completed'}}) === 2);
      assert.equal(calls, before + 1); assert.equal(downloads, previousDownloads + 2);
    });
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});
