"""Install a matted walking video into the candidate pack, retaining all frames."""
import argparse,hashlib,json,shutil
from pathlib import Path
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('direction',choices=['left','right','front','back']);p.add_argument('directory');args=p.parse_args();out=(root/args.directory).resolve();assert out.is_relative_to(root/'assets/video')
data=json.loads((out/'extraction120.json').read_text());assert data['frameCount']==121
files=sorted((out/'matte120').glob('frame-*.png'));bottom=data['bounds'][0][3];centers=[];legs=[]
for f in files:
 a=np.array(Image.open(f).getchannel('A'));mask=(a[max(0,bottom-14):bottom+5,:]>200).sum(axis=0)>4
 edges=np.diff(np.r_[False,mask,False].astype(int));starts=np.where(edges==1)[0];ends=np.where(edges==-1)[0]
 centers.append([(int(l)+int(r))/2 for l,r in zip(starts,ends) if r-l>=10]);legs.append(a[bottom-180:bottom:3,220:1060:3])
deltas=[];sign=1 if args.direction=='left' else -1
for before,after in zip(centers,centers[1:]):
 for x in after:
  values=[sign*(x-y) for y in before if 2<sign*(x-y)<30]
  if values:deltas.append(min(values))
if args.direction in ['left','right']:assert len(deltas)>50
leg_array=np.array(legs,dtype=np.float32);scores=[(i,float(np.abs(leg_array[i:]-leg_array[:-i]).mean())) for i in range(25,min(81,len(legs)//2+1))];stride=min(scores,key=lambda x:x[1])[0]
b=data['bounds'][0];crop=data['sharedCrop'];scale=80/(b[2]-b[0]) if args.direction in ['left','right'] else 40/(b[3]-b[1]);ground_speed=float(np.median(deltas)*24*scale) if args.direction in ['left','right'] else 24.18
packpath=root/'apps/godot/data/walk-video-candidate.json';pack=json.loads(packpath.read_text());anchor=[({'left':680,'right':600}.get(args.direction,(b[0]+b[2])/2))-crop[0],bottom-crop[1]]
frames=[{'texture':f'res://assets/pets/video-{args.direction}/'+f['texture'],'rect':f['rect'],'anchor':anchor} for f in data['frames']]
pack['clips']['walk_'+args.direction]={'fps':24,'loop':True,'scale':scale/pack['scale'],'stride_frames':stride,'ground_speed':ground_speed,'frames':frames}
pack['clips']['idle_'+args.direction]={'fps':1,'loop':True,'scale':scale/pack['scale'],'frames':[frames[0]]}
packpath.write_text(json.dumps(pack,ensure_ascii=False,indent=2)+'\n')
manifestpath=root/'assets/godot/manifest.json';manifest=json.loads(manifestpath.read_text());prefix='calico-video-'+args.direction+'-';manifest['assets']=[e for e in manifest['assets'] if not e['id'].startswith(prefix)]
dest=root/'assets/godot/pets'/('video-'+args.direction);dest.mkdir(exist_ok=True,parents=True);task=json.loads((out/'task.json').read_text())
for f in sorted((out/'atlas120').glob('*.png')):
 target=dest/f.name;shutil.copyfile(f,target);manifest['assets'].append({'id':prefix+f.stem,'path':f'pets/video-{args.direction}/'+f.name,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'author':'Wanpet; Seedance video and local chroma matting','source':'Seedance task '+task['id'],'license':'Original project reference and AI-generated video; third-party rights not independently cleared','prompt':(out/'prompt.txt').read_text(),'reference':args.directory+'/first-frame.png','transparentBackground':True,'review':'Full121-frame candidate; native direction checks pending'})
manifestpath.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
report={'direction':args.direction,'frames':121,'strideFrames':stride,'contactSamples':len(deltas),'estimatedGroundSpeed':ground_speed,'note':'Side contact-band heuristic; front/back use common scene-speed baseline, not a measured perspective stride. Not proof of zero sliding.'};(out/'stride-analysis.json').write_text(json.dumps(report,indent=2)+'\n');print(report)
