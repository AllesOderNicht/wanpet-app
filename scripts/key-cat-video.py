"""Matte every decoded video frame and build bounded, full-resolution atlas pages."""
import json,hashlib,argparse
from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--directory',default='assets/video/cat-idle-v1');args=parser.parse_args()
OUT=(ROOT/args.directory).resolve();assert OUT.is_relative_to(ROOT/'assets/video')
source=OUT/'decoded120';meta=json.loads((source/'sampling.json').read_text())
files=sorted(source.glob('frame-*.png'));assert len(files)==meta['frameCount'] and len(files)>=120
pts=np.array(meta['sampleTimesSeconds']);assert np.allclose(np.diff(pts),1/24,atol=1e-5)
assert meta['fps']==24 and abs(meta['durationSeconds']-len(files)/24)<0.001
work=OUT/'matte120';work.mkdir(exist_ok=True);bounds=[]
for path in files:
 rgb=np.array(Image.open(path).convert('RGB')).astype(np.float32)
 red,green,blue=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
 dominance=green-np.maximum(red,blue);alpha=1-np.clip((dominance-18)/65,0,1)
 rgb[:,:,1]=np.where((alpha>0)&(dominance>0),np.minimum(green,np.maximum(red,blue)),green)
 rgba=np.dstack([rgb,np.round(alpha*255)]).clip(0,255).astype(np.uint8)
 Image.fromarray(rgba).save(work/path.name)
 y,x=np.where(rgba[:,:,3]>128);assert len(x)>0
 bounds.append([int(x.min()),int(y.min()),int(x.max()+1),int(y.max()+1)])
size=Image.open(files[0]).size
left=max(0,min(b[0] for b in bounds)-16);top=max(0,min(b[1] for b in bounds)-16)
right=min(size[0],max(b[2] for b in bounds)+16);bottom=min(size[1],max(b[3] for b in bounds)+16)
w,h=right-left,bottom-top;columns=min(3,4096//w);rows=min(6,4096//h);per_page=columns*rows
assert w*columns<=4096 and h*rows<=4096
out=OUT/'transparent120';out.mkdir(exist_ok=True);pages=OUT/'atlas120';pages.mkdir(exist_ok=True)
hashes=[];entries=[];sheet=None
for i,path in enumerate(files):
 if i%per_page==0:sheet=Image.new('RGBA',(w*columns,h*rows))
 im=Image.open(work/path.name).crop((left,top,right,bottom));im.save(out/path.name)
 local=i%per_page;x=local%columns*w;y=local//columns*h
 sheet.paste(im,(x,y));hashes.append(hashlib.sha256(im.tobytes()).hexdigest())
 name=f'cat-video-{i//per_page:02d}.png';entries.append({'texture':name,'rect':[x,y,w,h],'sourceFrame':i,'pts':float(pts[i])})
 if local==per_page-1 or i==len(files)-1:sheet.save(pages/name)
report={'frameCount':len(files),'uniqueFrames':len(set(hashes)),'fps':24,'durationSeconds':len(files)/24,'cellSize':[w,h],'sharedCrop':[left,top,right,bottom],'bounds':bounds,'frames':entries,'source':'source.mp4','sampling':meta}
(OUT/'extraction120.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['frameCount','uniqueFrames','fps','cellSize','sharedCrop']}))
