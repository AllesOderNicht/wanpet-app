// Synthetic image only. Does not send player attachments or print credentials.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { CodexPetAgent } from '../apps/server/src/pet-agent.ts';

function chunk(type, data) {
  const content = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of content) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  const size = Buffer.alloc(4), checksum = Buffer.alloc(4);
  size.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, content, checksum]);
}
const root = await mkdtemp(join(tmpdir(), 'wanpet-vision-check-'));
try {
  const width = 480, height = 240, pixels = Buffer.alloc((width * 3 + 1) * height, 255);
  for (let y = 0; y < height; y++) {
    pixels[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const circle = (x - 120) ** 2 + (y - 120) ** 2 < 70 ** 2;
      const square = x > 290 && x < 430 && y > 50 && y < 190;
      if (circle || square) pixels.set(circle ? [230, 20, 20] : [20, 40, 230], y * (width * 3 + 1) + 1 + x * 3);
    }
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const path = join(root, 'shapes.png');
  await writeFile(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]));
  const agent = new CodexPetAgent({ apiKey: process.env.TOKEN_HUB_API_KEY, baseUrl: process.env.TOKEN_HUB_API_BASE_URL ?? 'https://us-api.tokenhub.com/v1', model: process.env.PET_CHAT_MODEL ?? 'claude-haiku-5.5' });
  let reply = '', toolResult;
  const run = async prompt => {
    reply = '';
    await agent.run({ prompt: JSON.stringify(prompt), images: [path], signal: AbortSignal.timeout(120000), text: async text => { reply = text; }, tool: async (name, args) => {
      assert.equal(name, 'generate_image'); toolResult = args;
      return { id: '00000000-0000-0000-0000-000000000002', origin: 'request', status: 'queued', image: null, error: null, attempt: 1 };
    } });
  };
  await run({ user: '描述图片中左右两个形状的颜色和形状，仅根据图像回答。' });
  assert.match(reply, /红/); assert.match(reply, /蓝/); assert.match(reply, /圆/); assert.match(reply, /方|矩形/);
  console.log('PASS Haiku image input:', reply);
  const previous = reply;
  await run({ history: [{ user: '描述这张图', assistant: previous }], user: '继续看刚才那张图：右边的图形是什么颜色？只回答颜色。' });
  assert.match(reply, /蓝/); console.log('PASS explicit image context:', reply);
  await run({ user: '请把附图左边的红色圆形改成绿色，右边保持不变。请调用生成工具，现在只是排队，不要提前说已经完成。', images: [{ index: 1, id: '00000000-0000-0000-0000-000000000001' }], imageCapabilities: { enabled: true, explicitRequest: true, giftEligible: false } });
  assert.deepEqual(toolResult?.referenceIds, ['00000000-0000-0000-0000-000000000001']);
  assert.match(reply, /排队|正在|处理中|等待|绘制中|开始/); console.log('PASS image tool and truthful queued result:', reply);
} catch (error) { console.error('FAIL vision check:', error instanceof Error ? error.message.replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]') : 'unknown'); process.exitCode = 1; }
finally { await rm(root, { recursive: true, force: true }); }
