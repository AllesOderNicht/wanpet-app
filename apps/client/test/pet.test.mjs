import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { advanceMotion, clampPoint, frameAt, frameScale, petLayout, parsePetPack, rasterSize } from '../.test-dist/model.js';

const sample = JSON.parse(readFileSync(new URL('../../../assets/pets/calico-v1/pet.json', import.meta.url), 'utf8'));
const clone = () => structuredClone(sample);
const bounds = { left: 90, right: 300, top: 400, bottom: 500 };
const motion = () => ({ position: { x: 100, y: 450 }, target: { x: 280, y: 450 }, facing: 'right', moving: false, distance: 0 });

test('shipped pack has separate left/right cycles and per-frame registration', () => {
  const pack = parsePetPack(sample);
  assert.equal(pack.clips.walkLeft.frames.length, 6);
  assert.equal(pack.clips.walkRight.frames.length, 6);
  assert.notEqual(pack.clips.walkLeft.frames[0].texture, pack.clips.walkRight.frames[0].texture);
  assert.ok(pack.clips.walkLeft.frames.every(f => f.anchor[1] > 0.5));
});
test('another species and frame count use the same contract without a cat skeleton', () => {
  const value = clone(); value.id = 'gecko'; value.species = '蜥蜴'; value.name = '小蜥蜴';
  value.clips.walkLeft.frames = value.clips.walkLeft.frames.slice(0, 4);
  value.clips.walkRight.frames = value.clips.walkRight.frames.slice(0, 4);
  assert.equal(parsePetPack(value).species, '蜥蜴');
});
test('reject remote URLs, traversal, oversized textures, NaN and missing actions', () => {
  for (const mutate of [
    p => { p.textures.idle.file = 'https://example.com/a.png'; },
    p => { p.textures.idle.file = '../secret.png'; },
    p => { p.textures.idle.width = 8192; },
    p => { p.speed = NaN; },
    p => { delete p.clips.walkLeft; },
  ]) { const p = clone(); mutate(p); assert.throws(() => parsePetPack(p)); }
});
test('reject out-of-bounds or repeated fake walk frames', () => {
  const p = clone(); p.clips.walkLeft.frames[0].rect[0] = 1536;
  assert.throws(() => parsePetPack(p), /边界/);
  const q = clone(); q.clips.walkLeft.frames = Array(6).fill(q.clips.walkLeft.frames[0]);
  assert.throws(() => parsePetPack(q), /独立/);
});
test('pack normalization does not retain mutable arrays from input', () => {
  const p = clone(), parsed = parsePetPack(p);
  p.clips.idle.frames[0].rect[0] = 900;
  assert.equal(parsed.clips.idle.frames[0].rect[0], 0);
});
test('off-center anchors keep every frame inside all four edges with room to move', () => {
  const p = clone();
  const corners = [[0, 0], [1, 0], [0, 1], [1, 1]];
  let i = 0;
  for (const clip of Object.values(p.clips)) for (const frame of clip.frames) frame.anchor = corners[i++ % 4];
  const pack = parsePetPack(p);
  for (const height of [420, 536, 700]) {
    const layout = petLayout(pack, 390, height), b = layout.bounds;
    assert.ok(layout.scale > 0 && layout.scale < 1, 'union requires a shared fit scale');
    assert.ok(b.right - b.left >= 48 - 1e-8);
    assert.ok(b.bottom - b.top >= 24 - 1e-8);
    for (const clip of Object.values(pack.clips)) for (const f of clip.frames) {
      const s = frameScale(pack, f) * layout.scale;
      const left = (f.bounds[0] - f.anchor[0] * f.rect[2]) * s;
      const right = left + f.bounds[2] * s;
      const top = (f.bounds[1] - f.anchor[1] * f.rect[3]) * s;
      const bottom = top + f.bounds[3] * s;
      assert.ok(b.left + left >= 14 - 1e-8);
      assert.ok(b.right + right <= 390 - 14 + 1e-8);
      assert.ok(b.top + top >= 14 - 1e-8);
      assert.ok(b.bottom + bottom <= height - 14 + 1e-8);
    }
  }
});
test('movement is time based at 30 and 60 fps', () => {
  const run = fps => { let m = motion(); for (let n = 0; n < fps; n++) m = advanceMotion(m, 1 / fps, 54, bounds); return m; };
  assert.ok(Math.abs(run(30).position.x - 154) < 1e-8);
  assert.ok(Math.abs(run(60).position.x - 154) < 1e-8);
});
test('clamp targets, never overshoot, stop on arrival, preserve facing for vertical movement', () => {
  assert.deepEqual(clampPoint({ x: 1000, y: -5 }, bounds), { x: 300, y: 400 });
  let m = motion(); m.target = { x: 102, y: 450 }; m = advanceMotion(m, 0.08, 54, bounds);
  assert.deepEqual(m.position, m.target); assert.equal(m.moving, false);
  m.target = { x: 90, y: 450 }; m = advanceMotion(m, 0.08, 54, bounds); assert.equal(m.facing, 'left');
  m.target = { x: m.position.x, y: 470 }; assert.equal(advanceMotion(m, 0.08, 54, bounds).facing, 'left');
});
test('long frame after backgrounding is capped; walk playback actually changes frames', () => {
  assert.ok(advanceMotion(motion(), 9, 54, bounds).position.x <= 104.32 + 1e-8);
  const c = parsePetPack(sample).clips.walkRight;
  assert.notDeepEqual(frameAt(c, 0).rect, frameAt(c, 0.125).rect);
  assert.deepEqual(frameAt(c, 0).rect, frameAt(c, 0.75).rect);
});
test('all shipped texture headers match the bounded metadata before browser decode', () => {
  for (const t of Object.values(sample.textures)) {
    const bytes = readFileSync(new URL('../../../assets/pets/calico-v1/' + t.file, import.meta.url));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + Math.min(32, bytes.byteLength));
    assert.deepEqual(rasterSize(buffer), [t.width, t.height]);
  }
});
test('reject unrelated or animated image containers', () => {
  assert.throws(() => rasterSize(new ArrayBuffer(8)), /不完整/);
  assert.throws(() => rasterSize(new ArrayBuffer(32)), /PNG/);
  const d = new DataView(new ArrayBuffer(32));
  d.setUint32(0, 0x52494646); d.setUint32(8, 0x57454250); d.setUint32(12, 0x56503858); d.setUint8(20, 2);
  assert.throws(() => rasterSize(d.buffer), /动画/);
});
test('PNG, simple lossy WebP and lossless WebP header dimensions', () => {
  const png = new DataView(new ArrayBuffer(32));
  png.setUint32(0, 0x89504e47); png.setUint32(4, 0x0d0a1a0a); png.setUint32(12, 0x49484452); png.setUint32(16, 200); png.setUint32(20, 100);
  assert.deepEqual(rasterSize(png.buffer), [200, 100]);
  const webp = new DataView(new ArrayBuffer(32));
  webp.setUint32(0, 0x52494646); webp.setUint32(8, 0x57454250); webp.setUint32(12, 0x56503820);
  webp.setUint8(23, 0x9d); webp.setUint8(24, 1); webp.setUint8(25, 0x2a); webp.setUint16(26, 400, true); webp.setUint16(28, 300, true);
  assert.deepEqual(rasterSize(webp.buffer), [400, 300]);
  webp.setUint32(12, 0x5650384c); webp.setUint8(20, 0x2f); webp.setUint32(21, 399 | (299 << 14), true);
  assert.deepEqual(rasterSize(webp.buffer), [400, 300]);
});
