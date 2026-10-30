import React,{useEffect,useRef,useState} from 'react';
import {StyleSheet,Text,View} from 'react-native';
import {RTNGodotView} from '@borndotcom/react-native-godot';
import {pauseEngine,resumeEngine,sceneEvents,sendScene,startEngine,stopEngine,type SceneEvent,type Surface} from './engine';
import type {CatLifeView} from '../../../../packages/contracts/src/index';
import {colors} from '../screens/shared';
export function GameSurface({resourcePath,surface,active,available,automatic,reduced,life,onEvent}:{resourcePath:string;surface:Surface;active:boolean;available:boolean;automatic:boolean;reduced:boolean;life?:CatLifeView|null;onEvent:(event:SceneEvent)=>void}) {
 const appliedSurface=useRef<Surface|null>(null);
 const eventHandler=useRef(onEvent);eventHandler.current=onEvent;
 const[ready,setReady]=useState(false);const[error,setError]=useState('');
 useEffect(()=>{appliedSurface.current=null;setReady(false);let alive=true;void startEngine(resourcePath).then(()=>{if(alive)setReady(true);}).catch(e=>{if(alive)setError(e instanceof Error?e.message:String(e));});return()=>{alive=false;void stopEngine().catch(()=>{});};},[resourcePath]);
 useEffect(()=>{
   if(!ready)return;
   if(active)resumeEngine();else pauseEngine();
 },[ready,active]);
 useEffect(()=>{
   if(!ready||!active)return;
   let alive=true;
   const dispatch=async(command:Record<string,unknown>)=>{
     if(!alive)return false;
     const accepted=await sendScene(command);
     if(!alive)return false;
     if(!accepted)throw new Error('场景没有接受同步请求。');
     return true;
   };
   void (async()=>{
     if(!await dispatch({type:'state',available,automatic,reduced}))return;
     if(appliedSurface.current!==surface){
       // An in-flight switch invalidates the old room, even if its effect is cancelled.
       appliedSurface.current=null;
       if(!await dispatch({type:'surface',value:surface}))return;
       appliedSurface.current=surface;
     }
     const desiredSurface=surface==='home'?'interior':surface;
     // The room can change before its new authoritative intention arrives.
     if(life&&(!life.intent||life.intent.surface===desiredSurface)){
       if(!await dispatch({type:'life',value:life}))return;
     }
     if(alive)setError('');
   })().catch(e=>{if(alive)setError(e instanceof Error?e.message:String(e));});
   return()=>{alive=false;};
 },[ready,active,surface,available,automatic,reduced,life]);
 useEffect(()=>{
   if(!ready||!active)return;
   let alive=true,reading=false;
   const timer=setInterval(()=>{if(!alive||reading)return;reading=true;void sceneEvents().then(events=>{for(const event of events){if(!alive)return;eventHandler.current(event);}}).catch(e=>{if(alive)setError(e instanceof Error?e.message:String(e));}).finally(()=>{reading=false;});},250);
   return()=>{alive=false;clearInterval(timer);};
 },[ready,active]);
 return <View collapsable={false} style={StyleSheet.absoluteFill} pointerEvents={active?'auto':'none'}><RTNGodotView style={StyleSheet.absoluteFill}/>{(!ready||!!error)&&<View style={styles.notice}><Text accessibilityRole={error?'alert':'text'} style={styles.text}>{error?'小屋暂时无法打开，请重新启动应用。':'正在打开小屋…'}</Text></View>}</View>;
}
const styles=StyleSheet.create({notice:{...StyleSheet.absoluteFillObject,backgroundColor:colors.paper,justifyContent:'center',alignItems:'center',padding:24},text:{color:colors.ink,fontSize:16}});
