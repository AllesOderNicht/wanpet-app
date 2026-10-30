"""Pack full transition videos in the shared reference coordinate system."""
from pathlib import Path
from PIL import Image
import json,math,hashlib
root=Path(__file__).resolve().parents[1];p=root/'apps/godot/data/pet.json';pack=json.loads(p.read_text());manifestpath=root/'assets/godot/manifest.json';manifest=json.loads(manifestpath.read_text())
for action,folder in [('lie_down','cat-lie-down-v2'),('rise','cat-rise-v2')]:
 out=root/'assets/video'/folder;meta=json.loads((out/'extraction120.json').read_text());files=sorted((out/'transparent120').glob('frame-*.png'));assert len(files)==121
 with Image.open(out/'decoded120/frame-000.png') as source:sw,sh=source.size
 crop=meta['sharedCrop'];world_scale=1280/(8*sw);factor=world_scale*3;w,h=meta['cellSize'];rw,rh=round(w*factor),round(h*factor);cw,ch=math.ceil(rw/4)*4+8,math.ceil(rh/4)*4+8;assert max(cw*11,ch*11)<=4096
 sheet=Image.new('RGBA',(cw*11,ch*11));anchor=[(sw/2-crop[0])*factor+4,(sh*900/1024-crop[1])*factor+4];frames=[]
 for i,file in enumerate(files):
  with Image.open(file) as im:im=im.resize((rw,rh),Image.Resampling.LANCZOS)
  x,y=i%11*cw,i//11*ch;sheet.paste(im,(x+4,y+4));frames.append({'texture':'res://assets/pets/runtime-video/'+action+'.png','rect':[x,y,cw,ch],'anchor':anchor})
 target=root/'assets/godot/pets/runtime-video'/(action+'.png');sheet.save(target);pack['clips'][action]={'fps':24,'loop':False,'scale':world_scale/(pack['scale']*factor),'frames':frames}
 ident='calico-runtime-transition-'+action;manifest['assets']=[e for e in manifest['assets'] if e['id']!=ident];manifest['assets'].append({'id':ident,'path':'pets/runtime-video/'+action+'.png','sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'author':'Wanpet; full Seedance transition and deterministic packing','source':json.loads((out/'task.json').read_text())['id'],'license':'Original project reference and AI-generated video; third-party rights not independently cleared','prompt':(out/'prompt.txt').read_text(),'reference':'assets/video/'+folder+'/source.mp4','transparentBackground':True,'review':'All121frames at24fps; integration pending'})
pack['standing_scale']=2.0;pack['display_oversampling']=3;pack['speed']=48.36
p.write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n');manifestpath.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
