import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const required = ['README.md', 'AGENTS.md', 'docs/product-plan.md', 'docs/architecture.md', 'docs/ui-flow.md', 'docs/art-direction.md', 'docs/qa-release.md', 'apps/mobile/App.tsx', 'apps/mobile/src/AppShell.tsx', 'apps/mobile/ios/WanpetMobile.xcodeproj/project.pbxproj', 'apps/mobile/android/app/build.gradle', 'apps/godot/scenes/rn_scene.tscn', 'apps/godot/project.godot', 'apps/godot/scenes/main.tscn', 'apps/godot/data/pet.json', 'assets/godot/manifest.json', 'apps/server/src/main.ts', 'packages/contracts/src/index.ts', 'packages/game-core/src/index.ts'];
for (const path of required) assert(existsSync(new URL(path, root)), `Missing: ${path}`);
for (const path of ['package.json','apps/mobile/package.json','apps/mobile/tsconfig.json','apps/client/package.json','apps/server/package.json','packages/contracts/package.json','packages/game-core/package.json','tsconfig.base.json','apps/client/tsconfig.json','apps/server/tsconfig.json','apps/server/tsconfig.build.json','packages/contracts/tsconfig.json','packages/game-core/tsconfig.json']) JSON.parse(read(path));
assert(JSON.parse(read('package.json')).private === true);
assert(read('.gitignore').includes('.env'));
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0');
assert(!tracked.some(path => /(^|\/)\.env(?:\.|$)/.test(path) && !path.endsWith('.env.example')), 'Private env files must not be tracked');
for (const line of read('.env.example').split('\n')) {
  const [key, ...parts] = line.split('=');
  if (/(PASSWORD|SECRET|TOKEN|KEY)$/.test(key ?? '')) assert(['', 'replace-with-private-value'].includes(parts.join('=').trim()), 'Example credentials must be placeholders');
}
console.log(`PASS: ${required.length} required files and JSON manifests. This is not a build or gameplay test.`);
