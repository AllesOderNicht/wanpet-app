import {spawnSync} from 'node:child_process';
import {mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const binary=process.env.MOBILE_GODOT_BIN??path.join(root,'.tools/godot-4.5.1/Godot.app/Contents/MacOS/Godot');
function run(command,args){const r=spawnSync(command,args,{cwd:root,encoding:'utf8'});if(r.error||r.status!==0||/(?:SCRIPT ERROR:|^ERROR:)/m.test((r.stdout??'')+(r.stderr??''))){throw new Error(`${command} failed\n${r.error??''}\n${r.stdout}\n${r.stderr}`);}return r.stdout;}
if(!run(binary,['--headless','--version']).startsWith('4.5.1.'))throw new Error('RN LibGodot requires the pinned4.5.1 resource importer');
run(process.execPath,['scripts/prepare-rn-game.mjs']);
run(binary,['--headless','--path','.tools/rn-game','--editor','--import','--quit']);
run(binary,['--headless','--path','.tools/rn-game','--script','res://tests/rn_bridge.gd']);
run(binary,['--headless','--path','.tools/rn-game','--script','res://tests/cat_life.gd']);
run(binary,['--headless','--path','.tools/rn-game','--script','res://tests/loft_table.gd']);
run(binary,['--headless','--path','.tools/rn-game','--export-pack','RN Scene','../../apps/mobile/ios/WanpetMobile/wanpet.pck']);
run(binary,['--headless','--path','.tools/rn-game','--export-pack','RN Scene','../rn-scene-android.zip']);
const android=path.join(root,'apps/mobile/android/app/src/main/assets/main');
await rm(android,{recursive:true,force:true});await mkdir(android,{recursive:true});
run('unzip',['-q',path.join(root,'.tools/rn-scene-android.zip'),'-d',android]);
console.log('Validated and packaged game-only assets for RN iOS and Android.');
