"""Pack every walking-video frame at 4x its logical display resolution."""
from pathlib import Path
import json,hashlib,math
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'assets/video/runtime-packing-v1';OUT.mkdir(exist_ok=True)
source=OUT/'source-pet.json'
if not source.exists():source.write_bytes((ROOT/'apps/godot/data/pet.json').read_bytes())
source_pack=json.loads(source.read_text());pack=json.loads((ROOT/'apps/godot/data/pet.json').read_text());manifest_path=ROOT/'assets/godot/manifest.json';manifest=json.loads(manifest_path.read_text());manifest['assets']=[e for e in manifest['assets'] if not e['id'].startswith('calico-runtime-walk-') and e['id'] not in {'calico-runtime-video-'+d for d in ['front','back','left','right']}]
oversampling=pack.get('display_oversampling',4);standing_scale=pack.get('standing_scale',1)
report={'oversampling':oversampling,'directions':{},'note':'RGBA base-level pixel sizes, not measured device GPU allocation'}
for direction in ['front','back','left','right']:
 key='walk_'+direction;clip=json.loads(json.dumps(source_pack['clips'][key]));pack['clips'][key]=clip;files=sorted((ROOT/f'assets/video/cat-walk-{direction}-v2/transparent120').glob('frame-*.png'));assert len(files)==len(clip['frames'])==121
 clip['scale']=float(clip.get('scale',1))*standing_scale
 if 'ground_speed' in clip:clip['ground_speed']*=standing_scale
 factor=float(pack['scale'])*clip['scale']*oversampling
 with Image.open(files[0]) as first:w,h=first.size
 rw,rh=round(w*factor),round(h*factor);cw=math.ceil(rw/4)*4+8;ch=math.ceil(rh/4)*4+8
 columns=min(11,4096//cw);rows=4096//ch;per_page=columns*rows;frames=[];sheets=[]
 sheet=None
 for i,path in enumerate(files):
  with Image.open(path) as original:
   frame=original.resize((rw,rh),Image.Resampling.LANCZOS)
  local=i%per_page
  if local==0:
   sheet=Image.new('RGBA',(cw*columns,ch*math.ceil(min(per_page,len(files)-i)/columns)));sheets.append(sheet)
  texture=f'res://assets/pets/runtime-video/{direction}-{i//per_page:02d}.png'
  x,y=local%columns*cw,local//columns*ch;sheet.paste(frame,(x+4,y+4))
  old=clip['frames'][i];frames.append({'texture':texture,'rect':[x,y,cw,ch],'anchor':[old['anchor'][0]*factor+4,old['anchor'][1]*factor+4]})
 full_paths={f['texture'] for f in clip['frames']};before=0
 for path in full_paths:
  with Image.open(ROOT/'apps/godot'/path.removeprefix('res://')) as im:before+=im.width*im.height*4
 clip['frames']=frames;clip['scale']=float(clip.get('scale',1))/factor
 pack['clips']['idle_'+direction]['frames']=[frames[0]];pack['clips']['idle_'+direction]['scale']=clip['scale']
 for page,sheet in enumerate(sheets):
  target=ROOT/f'assets/godot/pets/runtime-video/{direction}-{page:02d}.png';target.parent.mkdir(exist_ok=True,parents=True);sheet.save(target)
  manifest['assets'].append({'id':f'calico-runtime-walk-{direction}-{page:02d}','path':f'pets/runtime-video/{direction}-{page:02d}.png','sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'author':'Wanpet; deterministic full-frame video packing','source':f'assets/video/cat-walk-{direction}-v2/transparent120; all121frames','license':'Original project reference and AI-generated video; third-party rights not independently cleared','prompt':(ROOT/f'assets/video/cat-walk-{direction}-v2/prompt.txt').read_text(),'transparentBackground':True,'reference':f'assets/video/cat-walk-{direction}-v2/source.mp4','review':'All121frames retained; standing/rest proportions matched'})
 report['directions'][direction]={'frames':121,'sourceCell':[w,h],'runtimeCell':[cw,ch],'atlases':[list(im.size) for im in sheets],'beforeRGBABytes':before,'afterRGBABytes':sum(im.width*im.height*4 for im in sheets),'sourceScaleFactor':factor}
for name in ['pet.json','walk-video-candidate.json']:(ROOT/'apps/godot/data'/name).write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n')
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');(OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
before=sum(e['beforeRGBABytes'] for e in report['directions'].values());after=sum(e['afterRGBABytes'] for e in report['directions'].values());print({'frames':484,'beforeMiB':round(before/1048576,2),'afterMiB':round(after/1048576,2),'reductionPercent':round((1-after/before)*100,1)})
