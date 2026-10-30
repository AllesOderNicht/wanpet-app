import {Platform} from 'react-native';
import {RTNGodot,runOnGodotThread} from '@borndotcom/react-native-godot';
import type {CatLifeRequest} from '../../../../packages/contracts/src/index';
export type Surface='home'|'interior'|'courtyard';
export type SceneEvent={type:'surface';value:Surface}|{type:'hint';message:string}|({type:'life_request'}&Omit<CatLifeRequest,'automatic'|'expectedRevision'>);
let startup:Promise<void>|null=null;
let stopping:Promise<void>|null=null;
let created=false;
export function startEngine(resourcePath:string):Promise<void> {
  if(stopping)return stopping.then(()=>startEngine(resourcePath));
  if(startup)return startup;
  const args=Platform.OS==='android'?['--path','/main']:['--main-pack',`${resourcePath}/wanpet.pck`];
  args.push('--rendering-driver','opengl3','--rendering-method','gl_compatibility','--display-driver','embedded','res://scenes/rn_scene.tscn');
  startup=(async()=>{
    if(!RTNGodot)throw new Error('Godot 原生模块未安装，请重新构建应用。');
    await runOnGodotThread(()=>{'worklet';RTNGodot.createInstance(args);});
    created=true;
    for(let attempt=0;attempt<80;attempt++) {
      const ready=await runOnGodotThread(()=>{'worklet';const tree=RTNGodot.API().Engine.get_main_loop();return !!tree?.get_root()?.find_child('RNScene',true,false);});
      if(ready)return;
      await new Promise<void>(resolve=>setTimeout(resolve,50));
    }
    throw new Error('游戏场景未就绪，请检查场景资源包。');
  })();
  return startup;
}
export async function sendScene(command:Record<string,unknown>) {
  const raw=JSON.stringify(command);
  return runOnGodotThread(()=>{'worklet';const scene=RTNGodot.API().Engine.get_main_loop()?.get_root()?.find_child('RNScene',true,false);return !!scene?.dispatch(raw);});
}
export async function sceneEvents():Promise<SceneEvent[]> {
  const raw=await runOnGodotThread(()=>{'worklet';const scene=RTNGodot.API().Engine.get_main_loop()?.get_root()?.find_child('RNScene',true,false);return scene?.take_events()??'[]';});
  const values:unknown=JSON.parse(raw);
  return Array.isArray(values)?values.filter(v=>v&&((v.type==='surface'&&['home','interior','courtyard'].includes(v.value))||(v.type==='hint'&&typeof v.message==='string'&&v.message.length<200)||(v.type==='life_request'&&['interior','courtyard'].includes(v.surface)&&['observe','started','arrived','complete','blocked','stroke','invite'].includes(v.event)&&(v.intentId===null||typeof v.intentId==='string'&&/^[a-f0-9-]{36}$/.test(v.intentId))&&[null,'sunny','shelter'].includes(v.target)&&(v.invitedActivity===undefined||(v.event==='invite'&&v.invitedActivity==='read'))))):[];
}
export function pauseEngine(){if(RTNGodot)RTNGodot.pause();}
export function resumeEngine(){if(RTNGodot)RTNGodot.resume();}
export function stopEngine():Promise<void>{
  if(stopping)return stopping;
  if(!startup)return Promise.resolve();
  const pending=startup;
  stopping=(async()=>{
    // A scene can fail after the native instance exists; it still needs disposal.
    await pending.catch(()=>{});
    if(created){
      resumeEngine();
      await runOnGodotThread(()=>{'worklet';RTNGodot.destroyInstance();});
      created=false;
    }
    startup=null;
  })().finally(()=>{stopping=null;});
  return stopping;
}
