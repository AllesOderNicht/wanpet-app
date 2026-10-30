import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const project = path.join(root, 'apps/godot');
const bundled = path.join(root, '.tools/godot/Godot.app/Contents/MacOS/Godot');
const binary = process.env.GODOT_BIN || bundled;
if (!existsSync(binary)) throw new Error('Godot missing. Follow docs/godot-development.md or set GODOT_BIN.');
const mode = process.argv[2] || 'run';
const version = spawnSync(binary, ['--version'], { encoding: 'utf8' });
if (version.status !== 0 || !version.stdout.startsWith('4.7.2.stable')) throw new Error('Godot 4.7.2 stable is required.');
function run(command, args) {
  const checked = args.includes('--headless');
  const result = spawnSync(command, args, { cwd: root, env: process.env, stdio: checked ? 'pipe' : 'inherit', encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (checked) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
  }
  if (result.status !== 0 || (checked && /(?:SCRIPT ERROR|ERROR):/.test((result.stderr || '') + (result.stdout || '')))) process.exit(result.status || 1);
}
run(process.execPath, [path.join(root, 'scripts/sync-godot-assets.mjs')]);
if (['import', 'check', 'test', 'export'].includes(mode)) {
  run(binary, ['--headless', '--path', project, '--editor', '--import']);
}
if (mode === 'check' || mode === 'test') {
  run(binary, ['--headless', '--path', project, '--script', 'res://tests/check.gd']);
} else if (mode === 'export') {
  mkdirSync(path.join(project, 'exports'), { recursive: true });
  run(binary, ['--headless', '--path', project, '--export-debug', 'macOS', 'exports/Wanpet.zip']);
} else if (mode === 'run') {
  run(binary, ['--path', project, ...process.argv.slice(3)]);
} else if (mode === 'editor') {
  run(binary, ['--path', project, '--editor']);
} else if (mode !== 'import') {
  throw new Error('Unknown Godot operation: ' + mode);
}
