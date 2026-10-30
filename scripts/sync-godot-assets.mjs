import { readFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'assets/godot');
const target = path.join(root, 'apps/godot/assets');
const manifest = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'));
assert.equal(manifest.version, 1);
const names = new Set();
for (const asset of manifest.assets) {
  assert(/^[a-z0-9/_-]+\.(png|webp|ogv)$/.test(asset.path) && !asset.path.includes('..'), 'Invalid asset path');
  assert(!names.has(asset.path), 'Duplicate asset');
  names.add(asset.path);
  const file = path.join(source, asset.path);
  assert((await stat(file)).size < 24 * 1024 * 1024, 'Asset too large');
  const data = await readFile(file);
  const digest = createHash('sha256').update(data).digest('hex');
  assert.equal(digest, asset.sha256, 'Asset checksum mismatch: ' + asset.path);
  assert(asset.author && asset.source && asset.license && asset.prompt, 'Missing provenance: ' + asset.path);
  await mkdir(path.dirname(path.join(target, asset.path)), { recursive: true });
  await copyFile(file, path.join(target, asset.path));
}
console.log('Synced ' + names.size + ' verified original assets into Godot.');
