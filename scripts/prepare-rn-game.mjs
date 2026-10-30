import {readFile,mkdir,copyFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const source=path.join(root,'apps/godot');
const stage=path.join(root,'.tools/rn-game');
const scripts=['game_data.gd','pet.gd','room.gd','cat_life.gd','engawa_home.gd','rn_scene.gd'];
const configs=['pet.json','engawa-pet.json','interior.json','courtyard.json','morning-interior.json','morning-courtyard.json','morning-pet.json'];
const assets=new Set();
function collect(v){if(typeof v==='string'&&v.startsWith('res://assets/'))assets.add(v.slice(13));else if(v&&typeof v==='object')Object.values(v).forEach(collect);}
async function copy(relative){const target=path.join(stage,relative);await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(source,relative),target);}
for(const name of configs){const relative=`data/${name}`;collect(JSON.parse(await readFile(path.join(source,relative),'utf8')));await copy(relative);}
for(const name of scripts){const relative=`scripts/${name}`;const text=await readFile(path.join(source,relative),'utf8');for(const match of text.matchAll(/res:\/\/assets\/([^"\s]+)/g))assets.add(match[1]);await copy(relative);}
for(const name of ['rn_scene.tscn','room.tscn','pet.tscn'])await copy(`scenes/${name}`);
for(const name of await readdir(path.join(source,'shaders')))if(name.endsWith('.gdshader'))await copy(`shaders/${name}`);
await copy('tests/rn_bridge.gd');
await copy('tests/cat_life.gd');
await copy('tests/cat_live.gd');
await copy('tests/background_video.gd');
await copy('tests/loft_table.gd');
const manifest=JSON.parse(await readFile(path.join(root,'assets/godot/manifest.json'),'utf8'));
for(const asset of assets){assert(!asset.includes('..'));const entry=manifest.assets.find(e=>e.path===asset);assert(entry,`Missing source: ${asset}`);const file=path.join(root,'assets/godot',asset);assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'),entry.sha256);const target=path.join(stage,'assets',asset);await mkdir(path.dirname(target),{recursive:true});await copyFile(file,target);}
await writeFile(path.join(stage,'project.godot'),`config_version=5
[application]
config/name="Wanpet Scene"
run/main_scene="res://scenes/rn_scene.tscn"
config/features=PackedStringArray("4.5", "GL Compatibility")
[display]
window/size/viewport_width=390
window/size/viewport_height=844
window/stretch/mode="canvas_items"
window/stretch/aspect="expand"
[rendering]
renderer/rendering_method="gl_compatibility"
renderer/rendering_method.mobile="gl_compatibility"
textures/vram_compression/import_etc2_astc=true
textures/vram_compression/import_s3tc_bptc=true
environment/defaults/default_clear_color=Color(0.984,0.976,0.953,1)
`);
await writeFile(path.join(stage,'export_presets.cfg'),`[preset.0]
name="RN Scene"
platform="iOS"
runnable=false
export_filter="all_resources"
include_filter="data/*.json"
exclude_filter="tests/*"
[preset.0.options]
application/app_store_team_id="SIMULATOR0"
application/bundle_identifier="com.example.wanpet.scene"
`);
await writeFile(path.join(stage,'sources.json'),JSON.stringify({engine:'4.5.1',scripts,configs,assets:[...assets]},null,2));
console.log(`Prepared scene-only Godot project with ${assets.size} verified assets at ${stage}`);
