import {NativeModules} from 'react-native';
import {Session, type Journal} from './Session';
export interface PlatformBridge extends Journal {
  apiBaseURL: string;
  resourcePath: string;
  newKey(): string;
  nowMilliseconds(): number;
  readCredential(key: string): Promise<string | null>;
  writeCredential(key: string, value: string): Promise<void>;
  removeCredential(key: string): Promise<void>;
  request(url: string, method: string, headers: Record<string,string>, body: string | null): Promise<{status: number; body: string}>;
  startRecording?():Promise<void>;
  stopRecording?():Promise<{audio:string}>;
  cancelRecording?():Promise<void>;
}
export function createSession(bridge: PlatformBridge, development: boolean) {
  return new Session({baseURL:bridge.apiBaseURL,development,journal:bridge,credentials:{read:key=>bridge.readCredential(key),write:(key,value)=>bridge.writeCredential(key,value),remove:key=>bridge.removeCredential(key)},now:()=>bridge.nowMilliseconds(),key:()=>{
    const key=bridge.newKey();if(!/^[a-f0-9]{48}$/.test(key))throw new Error('STORAGE');return key;
  },fetch:async(input,init)=>{
    const headers:Record<string,string>={};new Headers(init?.headers).forEach((value,key)=>{headers[key]=value;});
    const response=await bridge.request(String(input),init?.method??'GET',headers,init?.body?String(init.body):null);
    return new Response(response.status===204?null:response.body,{status:response.status});
  }});
}
export function nativePlatform():PlatformBridge {
  const platform=NativeModules.WanpetPlatform;
  if(!platform)throw new Error('原生平台模块未安装，请重新构建应用。');
  return platform;
}
