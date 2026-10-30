"""Reuse the approved idle video in the room without reducing its frame count."""
from pathlib import Path
from PIL import Image
import json,math,hashlib,argparse
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--action',choices=['sleep','eat','pet'],default='sleep');parser.add_argument('--directory',default='assets/video/cat-idle-v1');args=parser.parse_args();action=args.action;out=(root/args.directory).resolve();assert out.is_relative_to(root/'assets/video')
meta=json.loads((out/'extraction120.json').read_text());files=sorted((out/'transparent120').glob('frame-*.png'));assert len(files)==121
packpath=root/'apps/godot/data/pet.json';pack=json.loads(packpath.read_text());backup=out/('previous-'+action+'.json')
if not backup.exists():backup.write_text(json.dumps(pack['clips'][action],indent=2))
b=meta['bounds'][0];crop=meta['sharedCrop'];world_scale=80/(b[2]-b[0]);factor=world_scale*4;w,h=meta['cellSize'];rw,rh=round(w*factor),round(h*factor);cw,ch=math.ceil(rw/4)*4+8,math.ceil(rh/4)*4+8
sheet=Image.new('RGBA',(cw*11,ch*11));anchor=[((b[0]+b[2])/2-crop[0])*factor+4,(b[3]-crop[1])*factor+4];frames=[]
for i,p in enumerate(files):
 with Image.open(p) as im:frame=im.resize((rw,rh),Image.Resampling.LANCZOS)
 x,y=i%11*cw,i//11*ch;sheet.paste(frame,(x+4,y+4));frames.append({'texture':'res://assets/pets/runtime-video/'+action+'.png','rect':[x,y,cw,ch],'anchor':anchor})
target=root/('assets/godot/pets/runtime-video/'+action+'.png');sheet.save(target)
pack['clips'][action]={'fps':24,'loop':action!='pet','scale':world_scale/(pack['scale']*factor),'frames':frames}
packpath.write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n');(root/'apps/godot/data/walk-video-candidate.json').write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n')
p=root/'assets/godot/manifest.json';m=json.loads(p.read_text());m['assets']=[e for e in m['assets'] if e['id']!='calico-runtime-video-'+action];m['assets'].append({'id':'calico-runtime-video-'+action,'path':'pets/runtime-video/'+action+'.png','sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'author':'Wanpet; approved Seedance idle video and deterministic full-frame packing','source':'Seedance '+json.loads((out/'task.json').read_text())['id']+', all121 frames','license':'Original project reference and AI-generated video; third-party rights not independently cleared','prompt':(out/'prompt.txt').read_text(),'reference':args.directory+'/source.mp4','transparentBackground':True,'review':'Full video life action, native check pending'});p.write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n');print({'frames':121,'fps':24,'atlas':sheet.size,'groundedWidth':80})
