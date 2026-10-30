import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ImageStore, uploadedBytes } from '../src/image-store';
import { explicitImageRequest, giftTopic } from '../src/image-service';
import { ImageProviderError, SeedreamProvider, seedreamResultUrl } from '../src/seedream';
import { loadConfig } from '../src/config';
import { mayRemember } from '../src/memory-policy';

test('uploads are decoded, bounded, metadata-free and cannot select filesystem paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wanpet-image-unit-'));
  try {
    const store = new ImageStore(root), id = randomUUID();
    const source = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#aa3311' } }).withMetadata().jpeg().toBuffer();
    assert.ok((await sharp(source).metadata()).exif);
    const image = await store.normalize(source); assert.equal(image.width, 300); assert.equal((await sharp(image.data).metadata()).exif, undefined);
    await store.save(id, image); assert.ok((await store.read(id, true)).length); await store.remove(id); await assert.rejects(store.read(id));
    assert.throws(() => store.path('../passwords')); assert.throws(() => uploadedBytes('not base64'));
    await assert.rejects(store.normalize(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/>')));
    await assert.rejects(store.normalize(Buffer.alloc(10 * 1024 * 1024 + 1)));
    await assert.rejects(store.normalize(Buffer.from('not an image')));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('ordinary visual conversation and negated requests do not authorize paid generation', () => {
  for (const text of ['我喜欢水彩画', '这张照片是什么？', '我梦到一个美丽的画面', '不要给我画一张猫', 'Do not generate an image']) assert.equal(explicitImageRequest(text), false, text);
  for (const text of ['画一张猫', '请帮我画一张海边的猫', '把这张照片改成水彩', 'Please generate a picture of a cat', 'Could you draw a cat?']) assert.equal(explicitImageRequest(text), true, text);
  assert.equal(giftTopic('你好'), false); assert.equal(giftTopic('我梦见一片星空'), true);
});
test('Seedream adapter requests exactly one image and bounds its result destination', async () => {
  const config = { apiKey: 'synthetic', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-seedream-test', size: '2K' as const, unitPriceFen: 22, dailyBudgetFen: 1000, referencePath: '/not-used' };
  const provider = new SeedreamProvider(config, (async (_url, init) => {
    const body = JSON.parse(String(init?.body)); assert.equal(body.sequential_image_generation, 'disabled'); assert.equal(body.stream, false); assert.equal(body.watermark, true); assert.equal(body.image.length, 1); assert.match(body.image[0], /^data:image\/jpeg;base64,/); assert.equal(init?.redirect, 'error');
    return new Response(JSON.stringify({ data: [{ url: 'https://test.tos-cn-beijing.volces.com/a.jpg?signature=synthetic' }], usage: { generated_images: 1 } }));
  }) as typeof fetch);
  assert.match((await provider.generate({ prompt: '猫', references: [Buffer.from('synthetic')], signal: AbortSignal.timeout(1000) })).url, /^https:/);
  for (const url of ['http://127.0.0.1/a', 'https://volces.com.evil.test/a', 'https://user:pass@foo.volces.com/a', 'https://foo.volces.com:444/a']) assert.throws(() => seedreamResultUrl(url));
  const reject = new SeedreamProvider(config, (async () => new Response('', { status: 400 })) as typeof fetch);
  await assert.rejects(reject.generate({ prompt: '猫', references: [], signal: AbortSignal.timeout(1000) }), (e: unknown) => e instanceof ImageProviderError && e.noCharge);
  const uncertain = new SeedreamProvider(config, (async () => new Response('', { status: 502 })) as typeof fetch);
  await assert.rejects(uncertain.generate({ prompt: '猫', references: [], signal: AbortSignal.timeout(1000) }), (e: unknown) => e instanceof ImageProviderError && !e.noCharge);
});
test('a provider key alone cannot enable unpriced image generation', () => {
  const env = { NODE_ENV: 'test', DATABASE_URL: 'postgresql://localhost/wanpet_test', CLIENT_ORIGIN: 'http://localhost:5173', SEEDREAM_API_KEY: 'synthetic' };
  assert.throws(() => loadConfig(env), /PRICE/);
  assert.throws(() => loadConfig({ ...env, SEEDREAM_MODEL: 'doubao-seedream-5-0-pro-260628', SEEDREAM_UNIT_PRICE_FEN: '12' }), /SEEDREAM_MODEL/);
  assert.throws(() => loadConfig({ ...env, SEEDREAM_MODEL: 'doubao-seedream-test' }), /PRICE/);
  const ready = loadConfig({ ...env, SEEDREAM_MODEL: 'doubao-seedream-test', SEEDREAM_UNIT_PRICE_FEN: '22' });
  assert.equal(ready.images?.dailyBudgetFen, 1000);
  assert.equal(loadConfig({...env, SEEDREAM_UNIT_PRICE_FEN:'12'}).images?.model, 'doubao-seedream-5-0-flash-260915');
});
test('visual follow-up facts are excluded even when explicitly requested as memories', () => {
  assert.equal(mayRemember('请记住刚才照片里的人叫小林', true), false);
  assert.equal(mayRemember('Remember the address in that picture', true), false);
  assert.equal(mayRemember('我喜欢在清晨散步'), true);
});
test('locked Flash adapter uses its supported single-image parameters', async () => {
  const config = loadConfig({NODE_ENV:'test',DATABASE_URL:'postgresql://localhost/wanpet_test',CLIENT_ORIGIN:'http://localhost:5173',SEEDREAM_API_KEY:'synthetic',SEEDREAM_UNIT_PRICE_FEN:'12'}).images!;
  const provider = new SeedreamProvider(config, (async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, 'doubao-seedream-5-0-flash-260915'); assert.equal(body.size, '2K');
    assert.equal(body.sequential_image_generation, undefined); assert.equal(body.stream, false);
    return new Response(JSON.stringify({data:[{url:'https://test.volces.com/image.jpg'}],usage:{generated_images:1}}));
  }) as typeof fetch);
  await provider.generate({prompt:'猫',references:[],signal:AbortSignal.timeout(1000)});
});
