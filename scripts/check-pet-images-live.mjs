// Real Haiku + Seedream acceptance. Uses its own test DB, bounded budget and resumable task IDs.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createApp } from '../apps/server/dist/bootstrap.js';
import { loadConfig } from '../apps/server/dist/config.js';
import { GameService } from '../apps/server/dist/service.js';
import { ChatService } from '../apps/server/dist/chat-service.js';
import { ImageService } from '../apps/server/dist/image-service.js';
import { planPostcard } from '../apps/server/dist/postcard-images.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !/^wanpet_test(?:_[a-z0-9]+)?$/.test(new URL(databaseUrl).pathname.slice(1))) throw Error('Isolated TEST_DATABASE_URL required');
const mockImages = process.argv.includes('--mock-images');
const directory = resolve('.tools/image-qa'), statePath = join(directory, mockImages ? 'device-state.json' : 'live-state.json'); await mkdir(directory, { recursive: true });
const serve = process.argv.includes('--serve');
const config = loadConfig({ ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl, PORT: serve ? '31824' : '0', CLIENT_ORIGIN: 'http://localhost:5173', PET_CHAT_ENABLED: 'true', MEM0_DATABASE_URL: '',
  SEEDREAM_API_KEY: mockImages ? 'synthetic-provider' : process.env.SEEDREAM_API_KEY || process.env.SEED_DANCE_API_KEY,
  SEEDREAM_MODEL: process.env.SEEDREAM_MODEL ?? 'doubao-seedream-5-0-flash-260915', SEEDREAM_UNIT_PRICE_FEN: process.env.SEEDREAM_UNIT_PRICE_FEN ?? '12', IMAGE_DAILY_BUDGET_FEN: '1000', PET_MEDIA_DIR: join(directory, 'media') });
assert.ok(config.images, 'An existing Ark credential is required');
const app = await createApp(config); await app.listen(config.port, '127.0.0.1');
const game = app.get(GameService), chat = app.get(ChatService), images = app.get(ImageService), db = game.db;
if (mockImages) images.provider = {
  generate: async ({references,signal}) => { console.log(JSON.stringify({event:'synthetic_image',references:references.length})); await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,2500);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('cancelled'));},{once:true});});return {url:'https://test.tos-cn-beijing.volces.com/synthetic.jpg'}; },
  download: async () => readFile(resolve('assets/postcards/forest-path-v1.png')),
};
const databaseName = new URL(databaseUrl).pathname.slice(1);
let state; try { state = JSON.parse(await readFile(statePath, 'utf8')); } catch { state = { databaseName, username: 'imageqa_' + randomUUID().slice(0, 8) }; }
assert.equal(state.databaseName, databaseName, 'Resume against the original test database');
const save = () => writeFile(statePath, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
const password = 'Wanpet-Images-QA-2026';
let auth; try { auth = await game.login((state.username) + "@example.test", password); } catch { auth = await game.register((state.username) + "@example.test", state.username, password); }
await save();
const identity = await game.authenticate('Bearer ' + auth.accessToken), snapshot = (await game.initialize(identity, 'initial')).snapshot;
const wait = async condition => { for (let n = 0; n < 180; n++) { if (await condition()) return; await new Promise(r => setTimeout(r, 1000)); } throw Error('Observed job still pending; rerun to resume the same recorded ID'); };
const checkJob = async id => {
  await wait(async () => !['proposed', 'queued', 'submitted', 'saving'].includes((await db.imageJob.findUniqueOrThrow({ where: { id } })).status));
  const job = await db.imageJob.findUniqueOrThrow({ where: { id } }); assert.equal(job.status, 'completed', job.error ?? 'Image task did not complete');
  return job;
};
const chatImage = async (name, text, imageIds = []) => {
  if (!state[name]) { state[name] = (await chat.submit(identity, 'live-' + name, { text, surface: 'interior', imageIds, imageIntent: true })).body.id; await save(); }
  const id = state[name];
  await wait(async () => !['queued', 'running'].includes((await db.chatTurn.findUniqueOrThrow({ where: { id } })).status));
  const turn = await db.chatTurn.findUniqueOrThrow({ where: { id } }); assert.equal(turn.status, 'completed', turn.error ?? 'Haiku failed');
  const job = await db.imageJob.findUniqueOrThrow({ where: { turnId: id } });
  if (process.argv.includes('--retry-' + name) && ['failed','unknown'].includes(job.status)) await images.control(identity, 'live-retry-' + config.images.model + '-' + name, job.id, 'retry');
  return checkJob(job.id);
};
if (serve) {
  console.log(JSON.stringify({ api: await app.getUrl(), username: state.username, model: config.images.model, liveImages: !mockImages, mockImages, dailyBudgetFen: config.images.dailyBudgetFen }));
} else {
  try {
    const generated = await chatImage('textTurn', '画一张原创水彩插画：一只三花猫坐在窗边看蓝天，猫保持真实猫的身体比例，画面不要文字。');
    await copyFile(images.store.path(generated.imageId), join(directory, 'seedream-text.jpg')); console.log('PASS real Haiku → Seedream text-to-image');
    if (!state.referenceId) { const asset = await images.upload(identity, 'live-reference', { data: (await readFile(config.images.referencePath)).toString('base64') }); state.referenceId = asset.body.id; await save(); }
    const edited = await chatImage('editTurn', '请以本轮上传的三花猫为唯一参考，保持它的毛色花纹和比例，把它画在有小溪的森林里。只画一只猫，原创水彩画面，无文字。', [state.referenceId]);
    assert.ok(edited.referenceIds.includes(state.referenceId)); await copyFile(images.store.path(edited.imageId), join(directory, 'seedream-reference.jpg')); console.log('PASS real reference-image editing');
    if (!state.postcardJob) {
      const trip = await db.trip.create({ data: { playerId: snapshot.player.id, configVersion: 'image-live-test', destinationId: 'test_forest', loadout: [], rewards: [], startedAt: new Date(Date.now() - 120000), returnAt: new Date(Date.now() - 60000), claimedAt: new Date(), claimResponse: {} } });
      const job = await db.$transaction(tx => planPostcard(tx, { tripId: trip.id, accountId: identity.accountId, petId: snapshot.pet.id, speciesId: snapshot.pet.speciesId, destination: trip.destinationId, theme: 'test_postcard_forest' }, 0)); state.postcardJob = job.id; await save();
    }
    const postcard = await checkJob(state.postcardJob); await copyFile(images.store.path(postcard.imageId), join(directory, 'seedream-postcard.jpg'));
    console.log('PASS real postcard image generation');
    const charges = await db.imageCharge.findMany({ where: { jobId: { in: [generated.id, edited.id, postcard.id] } } });
    const charged=charges.filter(c=>c.status!=='released');assert.equal(charged.length, 3); assert.ok(charged.every(c => c.status === 'charged' && c.amountFen === config.images.unitPriceFen));
    console.log(JSON.stringify({ model: config.images.model, images: 3, reservedAndSettledFen: charged.reduce((n, c) => n + c.amountFen, 0), note: 'Configured official rate; not a supplier invoice' }));
  } finally { await app.close(); }
}
