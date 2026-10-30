import {mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const platform of ['ios','android']){
  const output=path.join(root,'.tools/rn-bundle',platform);
  await mkdir(output,{recursive:true});
  const result=spawnSync(process.execPath,[path.join(root,'node_modules/react-native/cli.js'),'bundle','--platform',platform,'--dev','false','--entry-file','index.js','--bundle-output',path.join(output,'main.jsbundle'),'--assets-dest',output],{cwd:path.join(root,'apps/mobile'),stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status??1);
}
