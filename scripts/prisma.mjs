import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const root = new URL('../', import.meta.url);
const args = [];
if (existsSync(new URL('.env', root))) args.push(`--env-file=${new URL('.env', root).pathname}`);
args.push(new URL('../node_modules/prisma/build/index.js', import.meta.url).pathname, ...process.argv.slice(2), '--schema', new URL('../apps/server/prisma/schema.prisma', import.meta.url).pathname);
const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
process.exit(result.status ?? 1);
