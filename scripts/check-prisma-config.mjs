import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deepmerge } from 'deepmerge-ts';
import { loadConfigFromFile } from '@prisma/config';

// Narrow compatibility check for the documented @prisma/config -> deepmerge-ts override.
// No Prisma engine, database connection, credentials, or lifecycle script is used.
assert.deepEqual(deepmerge({ a: { x: 1 } }, { a: { y: 2 } }), { a: { x: 1, y: 2 } });
const left = {}; left.self = left;
const right = {}; right.self = right;
assert.doesNotThrow(() => deepmerge(left, right));
const directory = await realpath(await mkdtemp(join(tmpdir(), 'wanpet-prisma-config-')));
try {
  await writeFile(join(directory, 'prisma.config.js'), "module.exports = { schema: './schema.prisma', migrations: { path: './migrations' } };\n");
  const result = await loadConfigFromFile({ configRoot: directory });
  assert(!result.error, `Configuration failed: ${JSON.stringify(result.error)}`);
  assert.equal(result.config.schema, join(directory, 'schema.prisma'));
  assert.equal(result.config.migrations.path, join(directory, 'migrations'));
  console.log('PASS: plain-object merge, circular graph regression, Prisma config loading; no database test.');
} finally {
  await rm(directory, { recursive: true, force: true });
}
