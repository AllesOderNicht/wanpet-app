import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=p=>readFileSync(path.join(root,p),'utf8');
const tracked=new Set(execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean));
const files=JSON.parse(read('assets/runtime-files.json')).files;
const allowed=new Set(files);
assert.equal(allowed.size,files.length,'Duplicate runtime resource');
for(const file of files){
 assert(file.startsWith('assets/')&&!file.split('/').includes('..'),'Invalid runtime path');
 assert(tracked.has(file),`Runtime resource not tracked: ${file}`);
 assert(existsSync(path.join(root,file)),`Missing runtime resource: ${file}`);
}
for(const file of tracked){
 if(file.startsWith('assets/video/'))assert.fail(`Production intermediate tracked: ${file}`);
 if(file.startsWith('assets/')&&/\.(png|jpe?g|webp|gif|mp4|ogv|ttf|woff2?|otf)$/i.test(file))assert(allowed.has(file),`Unlisted art: ${file}`);
}
const manifest=JSON.parse(read('assets/godot/manifest.json'));
const godot=new Set();
for(const asset of manifest.assets){
 const file='assets/godot/'+asset.path;
 assert(!godot.has(file),`Duplicate Godot resource: ${file}`);godot.add(file);
 assert(allowed.has(file),`Godot resource not listed: ${file}`);
 assert.equal(createHash('sha256').update(readFileSync(path.join(root,file))).digest('hex'),asset.sha256,`Checksum mismatch: ${file}`);
}
for(const file of tracked){
 if(file.startsWith('apps/godot/')&&/\.(json|gd|tscn|gdshader)$/.test(file)){
  for(const [,relative] of read(file).matchAll(/res:\/\/assets\/([^\s"']+\.(?:png|webp|ogv))/g)){
   if(relative.includes('..')||relative==='morning/missing.ogv')continue; // Intentionally invalid regression fixtures.
   assert(godot.has('assets/godot/'+relative),`Untracked Godot reference in ${file}: ${relative}`);
  }
 }
 if(file.startsWith('apps/')&&/\.(tsx?|css|html|mjs)$/.test(file)){
  for(const [,reference] of read(file).matchAll(/["']([^"']*assets\/[^"']+)["']/g)){
   const relative=reference.split('?')[0];
   const target=relative.startsWith('.')?path.resolve(root,path.dirname(file),relative):path.resolve(root,relative);
   if(/\.(png|jpe?g|webp|gif|ttf|woff2?|otf)$/.test(target))assert(allowed.has(path.relative(root,target)),`Untracked art reference in ${file}: ${reference}`);
  }
 }
}
console.log(`PASS: ${files.length} runtime resources tracked; ${manifest.assets.length} Godot checksums and source references verified.`);
