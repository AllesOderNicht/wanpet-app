import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const binary=process.env.MOBILE_GODOT_BIN??path.join(root,'.tools/godot-4.5.1/Godot.app/Contents/MacOS/Godot');
function checked(command,args){
 const result=spawnSync(command,args,{cwd:root,encoding:'utf8'});
 const output=(result.stdout??'')+(result.stderr??'');
 if(result.error||result.status!==0||/(?:SCRIPT ERROR:|^ERROR:)/m.test(output))throw new Error(`${result.error??''}\n${output}`);
 return output;
}
if(!checked(binary,['--headless','--version']).startsWith('4.5.1.'))throw new Error('Preview requires the mobile Godot 4.5.1 engine.');
checked(process.execPath,['scripts/prepare-rn-game.mjs']);
checked(binary,['--headless','--path','.tools/rn-game','--editor','--import','--quit']);
const result=spawnSync(binary,['--path','.tools/rn-game','--script','res://tests/loft_table.gd','--','--interactive'],{cwd:root,stdio:'inherit'});
process.exit(result.status??1);
