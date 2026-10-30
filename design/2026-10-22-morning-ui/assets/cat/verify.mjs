import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const manifest = JSON.parse(await readFile(new URL('./manifest.json', import.meta.url)));
const repo = new URL('../../../../', import.meta.url);
for (const clip of Object.values(manifest.clips)) {
  const copy = await readFile(new URL(clip.file, import.meta.url));
  const original = await readFile(new URL(clip.sourceFile, repo));
  assert.deepEqual(copy, original, `${clip.file}: source bytes preserved`);
  assert.equal(createHash('sha256').update(copy).digest('hex'), clip.sha256);
  assert.equal(clip.frames.length, clip.frameCount);
  for (const frame of clip.frames) {
    const [x, y, w, h] = frame.rect;
    assert(x >= 0 && y >= 0 && x + w <= clip.width && y + h <= clip.height);
  }
}

let clock = 1000, nextFrame = 1, drawing = null;
const scheduled = new Map(), requested = [];
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock } });
globalThis.window = { devicePixelRatio: 2 };
globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
globalThis.requestAnimationFrame = fn => { scheduled.set(nextFrame, fn); return nextFrame++; };
globalThis.cancelAnimationFrame = id => scheduled.delete(id);
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.Image = class {
  set src(value) { requested.push(value); queueMicrotask(() => this.onload()); }
};
globalThis.fetch = async () => ({ ok: true, json: async () => structuredClone(manifest) });
const context = { clearRect() {}, drawImage(...values) { drawing = values; } };
const canvas = {
  dataset: {}, width: 0, height: 0,
  getContext: () => context,
  getBoundingClientRect: () => ({ width: 260, height: 160 }),
  dispatchEvent() { assert.fail('Unexpected caterror'); },
};
const { createCat } = await import('../../cat.js');
const cat = createCat(canvas);
await cat.ready;
assert.equal(canvas.dataset.catMotion, 'rest');
assert.equal(requested.length, 1, 'Walk atlases must load lazily');
const checkFit = () => {
  const [, , , sw, sh, dx, dy, dw, dh] = drawing;
  assert(Math.abs(dw / dh - sw / sh) < 1e-8, 'Source aspect ratio preserved');
  assert(dx >= 0 && dy >= 0 && dx + dw <= canvas.width && dy + dh <= canvas.height);
};
checkFit();
for (const motion of ['left', 'right']) {
  cat.setMotion(motion);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(canvas.dataset.catMotion, motion);
  checkFit();
  clock += 800;
  const pending = [...scheduled.values()]; scheduled.clear();
  pending.forEach(fn => fn(clock));
  assert.equal(canvas.dataset.catFrame, '19');
  checkFit();
}
cat.setReduced(true);
assert.equal(scheduled.size, 0, 'Reduced motion stops animation scheduling');
assert.equal(canvas.dataset.catFrame, '0');
assert.throws(() => cat.setMotion('missing'), /Unknown cat motion/);
cat.destroy();
assert.equal(scheduled.size, 0);
console.log('PASS: exact source copies, hashes, frame bounds, lazy loading, 3-motion rendering, aspect fit, frame progression, reduced motion, and cleanup.');
