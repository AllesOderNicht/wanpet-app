"""Submit once or resume an existing Seedance job; never log secrets/signed URLs."""
import argparse,base64,json,re,urllib.request,urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/video/cat-idle-v1'
API='https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks'
def run():
 p=argparse.ArgumentParser();p.add_argument('action',choices=['submit','poll']);p.add_argument('--directory',default='assets/video/cat-idle-v1');p.add_argument('--reference',action='store_true');args=p.parse_args();config={};out=(ROOT/args.directory).resolve();assert out.is_relative_to(ROOT/'assets/video')
 for line in (ROOT/'.env').read_text().splitlines():
  m=re.match(r'\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$',line)
  if m:config[m[1]]=m[2].strip('\"\x27')
 key=config['SEED_DANCE_API_KEY'];state=out/'task.json'
 if args.action=='submit':
  if state.exists():raise SystemExit('Existing task recorded: poll instead.')
  image='data:image/png;base64,'+base64.b64encode((out/'first-frame.png').read_bytes()).decode()
  payload={'model':'doubao-seedance-2-5-260628','content':[{'type':'text','text':(out/'prompt.txt').read_text()},{'type':'image_url','image_url':{'url':image},'role':'first_frame'},{'type':'image_url','image_url':{'url':image},'role':'last_frame'}],'generate_audio':False,'ratio':'adaptive','duration':5,'resolution':'720p','watermark':False}
  if args.reference:
   payload['content']=payload['content'][:2];payload['content'][1]['role']='reference_image';payload['ratio']='16:9'
  if not args.reference and (out/'last-frame.png').exists():
   payload['content'][2]['image_url']['url']='data:image/png;base64,'+base64.b64encode((out/'last-frame.png').read_bytes()).decode()
  req=urllib.request.Request(API,data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
 else:
  task=json.loads(state.read_text());req=urllib.request.Request(API+'/'+task['id'],headers={'Authorization':'Bearer '+key})
 try:
  with urllib.request.urlopen(req,timeout=60) as response:data=json.load(response)
 except urllib.error.HTTPError as e:
  raw=e.read().decode().replace(key,'<redacted>');print(json.dumps({'httpStatus':e.code,'error':raw[:1600]},ensure_ascii=False));raise SystemExit(1)
 safe={k:v for k,v in data.items() if k in ['id','status','model','created_at','updated_at','error','usage','resolution','duration','ratio','framespersecond']}
 state.write_text(json.dumps(safe,ensure_ascii=False,indent=2)+'\n');print(json.dumps(safe,ensure_ascii=False))
 if data.get('status')=='succeeded' and not (out/'source.mp4').exists():
  url=data.get('content',{}).get('video_url')
  if not url:raise SystemExit('Succeeded but video URL missing')
  with urllib.request.urlopen(url,timeout=120) as response:blob=response.read()
  (out/'source.mp4').write_bytes(blob);print('Video saved: '+str(out/'source.mp4'))
if __name__=='__main__':run()
