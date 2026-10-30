import React,{useEffect,useRef,useState} from 'react';
import {AppState,Image,Modal,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {launchCamera,launchImageLibrary} from 'react-native-image-picker';
import type {ImageJobView,MediaView,PostcardView,ImageBudgetView} from '../../../../packages/contracts/src/index';
import {Session} from '../session/Session';
import type {PlatformBridge} from '../session/platform';
import * as wire from '../session/image-wire';
import {Action,Copy,Postcard,colors,s} from './shared';

export const imageErrors:Record<string,string>={IMAGE_GENERATION_NOT_CONFIGURED:'生图服务待配置，看图和文字聊天仍可使用。',IMAGE_BUDGET_EXHAUSTED:'今天的绘图额度已用完，明天再画吧。',IMAGE_PROVIDER_LIMIT:'绘图服务繁忙，请稍后手动重试。',IMAGE_PROVIDER_FAILED:'这次没有画成功，可以手动重试。',IMAGE_RESULT_UNKNOWN:'暂时无法确认是否已经生成，再次生成可能再次计费。',IMAGE_SAVE_FAILED:'图片未能保存，可以手动重新生成。',IMAGE_REFERENCE_UNAVAILABLE:'参考图片暂不可用。',IMAGE_TOO_LARGE:'每张图片最多 10 MiB。',INVALID_IMAGE:'请选择有效的 JPEG、PNG、WebP 或支持的 HEIC 图片。',IMAGE_NOT_FOUND:'这张图片已删除或不可用，请重新选择。',IMAGE_UPLOAD_LIMIT:'待发送图片太多，请先移除不用的图片。'};
export function Picture({session,image,small=false}:{session:Session;image:MediaView;small?:boolean}) {
 const[open,setOpen]=useState(false),[failed,setFailed]=useState(false);
 return <><Pressable accessibilityRole="button" accessibilityLabel="查看图片" onPress={()=>setOpen(true)} style={{maxWidth:'100%'}}>
  <Image source={session.imageSource(image.id)} resizeMode="contain" onError={()=>setFailed(true)} style={{width:small?92:260,height:small?82:Math.min(240,260*image.height/image.width),borderRadius:8,backgroundColor:'#eee7da'}}/>
  {failed&&<Copy>图片暂时无法加载</Copy>}
 </Pressable><Modal visible={open} transparent animationType="fade" onRequestClose={()=>setOpen(false)}><View style={styles.viewer}><Action label="关闭图片" onPress={()=>setOpen(false)}/><ScrollView contentContainerStyle={{flexGrow:1,justifyContent:'center'}} maximumZoomScale={4} minimumZoomScale={1}><Image accessibilityLabel="图片原图" source={session.imageSource(image.id,false)} resizeMode="contain" style={{width:'100%',height:500}}/></ScrollView></View></Modal></>;
}
export function ImageTask({session,job,busy,write}:{session:Session;job:ImageJobView;busy:boolean;write:(path:string)=>void}) {
 const pending=['queued','submitted','saving'].includes(job.status);
 return <View style={styles.task}>
  {job.image&&<Picture session={session} image={job.image}/>}
  <Copy style={styles.note}>{job.origin==='gift'?'它送来的一幅画 · ':''}{job.status==='proposed'?'想为你画：'+job.prompt:job.status==='queued'?'图片已排队':job.status==='submitted'?'正在绘图…':job.status==='saving'?'正在保存图片…':job.status==='completed'?'生成图片':job.status==='cancelled'?'已取消图片任务':imageErrors[job.error??'']??'这次没有完成绘图。'}</Copy>
  {job.status==='proposed'&&!!job.referenceIds?.length&&<><Copy>将使用这些参考图片：</Copy><View style={[styles.row,{flexWrap:'wrap'}]}>{job.referenceIds.map(id=><Picture key={id} session={session} image={{id,width:1,height:1,kind:'upload'}} small/>)}</View></>}
  {job.status==='proposed'&&<Action label="好呀，画一张" disabled={busy} onPress={()=>write(`/me/pet/images/${job.id}/confirm`)}/>}
  {(pending||job.status==='proposed')&&<Action label={job.status==='proposed'?'这次不画':'取消等待图片'} disabled={busy} onPress={()=>write(`/me/pet/images/${job.id}/cancel`)}/>}
  {['failed','unknown'].includes(job.status)&&['request','proposal'].includes(job.origin)&&<Action label="重新生成图片" disabled={busy} onPress={()=>write(`/me/pet/images/${job.id}/retry`)}/>}
 </View>;
}
export function ImageBudget({session}:{session:Session}){
 const[value,setValue]=useState<ImageBudgetView|null>(null);
 useEffect(()=>{let alive=true;const owner=session.state.account?.id;
  const refresh=async()=>{try{const data=await session.chatRead('/me/pet/images/budget');if(alive&&session.state.account?.id===owner&&wire.budget(data))setValue(data);}catch{/* Submitting still checks the authoritative budget. */}};
  void refresh();const timer=setInterval(()=>{if(AppState.currentState==='active')void refresh();},30000);
  return()=>{alive=false;clearInterval(timer);};
 },[session]);
 return value?<Copy style={styles.note}>今日共享绘图额度还剩 ¥{(Math.max(0,value.limitFen-value.usedFen)/100).toFixed(2)} · {new Date(value.resetsAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} 重置</Copy>:null;
}
type DraftImage={key:string;uri:string;data:string;asset?:MediaView;error?:string};
export function useImageDraft(session:Session,platform:PlatformBridge,current:()=>boolean) {
 const[items,setItems]=useState<DraftImage[]>([]),[working,setWorking]=useState(false),[error,setError]=useState('');
 const removed=useRef(new Set<string>()),busy=useRef(false),all=useRef<DraftImage[]>([]);all.current=items;
 async function upload(item:DraftImage){
  try{const result=await session.imageUpload(item.data,item.key);if(!wire.media(result))throw new Error('INVALID_RESPONSE');if(!current())return;
   if(removed.current.has(item.key)){void session.discardImage(result.id,platform.newKey()).catch(()=>{});return;}
   setItems(previous=>previous.map(p=>p.key===item.key?{...p,asset:result,error:undefined,data:''}:p));
  }catch(e){if(current())setItems(previous=>previous.map(p=>p.key===item.key?{...p,error:imageErrors[e instanceof Error?e.message:'']??'上传中断，可以重试。'}:p));}
 }
 async function pick(camera:boolean){
  if(busy.current||all.current.length>=4)return;busy.current=true;setWorking(true);setError('');
  try{const options={mediaType:'photo' as const,includeBase64:true,maxWidth:2048,maxHeight:2048,quality:0.9 as const,selectionLimit:4-all.current.length,assetRepresentationMode:'compatible' as const};
   const result=await(camera?launchCamera({...options,saveToPhotos:false}):launchImageLibrary(options));if(!current()||result.didCancel)return;
   if(result.errorCode)throw new Error(result.errorCode==='permission'?'请允许相机或照片访问，也可以继续文字聊天。':'暂时无法打开照片，请稍后再试。');
   const picked:DraftImage[]=[];
   for(const asset of (result.assets??[]).slice(0,4-all.current.length)){if(!asset.base64||!asset.uri)throw new Error('无法读取这张图片。');if((asset.fileSize??0)>10*1024*1024)throw new Error(imageErrors.IMAGE_TOO_LARGE);picked.push({key:platform.newKey(),uri:asset.uri,data:asset.base64});}
   setItems(previous=>[...previous,...picked]);for(const item of picked)await upload(item);
  }catch(e){if(current())setError(e instanceof Error?e.message:'无法选择图片。');}finally{busy.current=false;if(current())setWorking(false);}
 }
 async function retry(item:DraftImage){if(busy.current)return;busy.current=true;setWorking(true);try{await upload(item);}finally{busy.current=false;if(current())setWorking(false);}}
 function remove(item:DraftImage){removed.current.add(item.key);setItems(previous=>previous.filter(p=>p.key!==item.key));if(item.asset)void session.discardImage(item.asset.id,platform.newKey()).catch(()=>{});}
 function clear(){setItems([]);setError('');removed.current.clear();}
 const controls=<><View style={styles.row}><Action label="选图片" disabled={working||items.length>=4} onPress={()=>{void pick(false);}}/><Action label="拍照片" disabled={working||items.length>=4} onPress={()=>{void pick(true);}}/>{working&&<Copy>正在上传图片…</Copy>}</View>
  {!!error&&<Text accessibilityRole="alert" style={s.alertCopy}>{error}</Text>}
  {!!items.length&&<ScrollView horizontal><View style={styles.row}>{items.map(item=><View key={item.key} style={{width:105,gap:4}}><Image source={{uri:item.uri}} style={{width:96,height:72,borderRadius:6}}/><Action label="移除图片" onPress={()=>remove(item)}/>{item.error?<><Copy style={styles.note}>{item.error}</Copy><Action label="重试上传" disabled={working} onPress={()=>{void retry(item);}}/></>:<Copy style={styles.note}>{item.asset?'已上传':'上传中…'}</Copy>}</View>)}</View></ScrollView>}
 </>;
 return {items,working,controls,clear,ready:items.every(i=>!!i.asset),ids:items.flatMap(i=>i.asset?[i.asset.id]:[])};
}
export function PostcardPictures({session,theme,tripId,latest=false,children}:{session:Session;theme?:string;tripId?:string;latest?:boolean;children?:React.ReactNode}){
 const[items,setItems]=useState<PostcardView[]>([]),[before,setBefore]=useState<string|null>(null),[error,setError]=useState('');
 const owner=session.state.account?.id,alive=useRef(true),older=useRef<PostcardView[]>([]);
 useEffect(()=>{alive.current=true;let timer:ReturnType<typeof setTimeout>;
  const poll=async()=>{try{if(AppState.currentState==='active'){const result=await session.chatRead('/me/postcards');if(!wire.postcards(result))throw new Error('INVALID_RESPONSE');if(alive.current&&session.state.account?.id===owner){setItems([...result.items,...older.current.filter(p=>!result.items.some(n=>n.tripId===p.tripId))]);if(!older.current.length)setBefore(result.before);setError('');}}}catch{if(alive.current)setError('明信片暂时未能同步。');}if(alive.current)timer=setTimeout(poll,1000);};void poll();return()=>{alive.current=false;clearTimeout(timer);};
 },[session,owner]);
 const shown=items.filter(p=>p.claimed&&(!tripId||p.tripId===tripId)&&(!theme||p.theme===theme)).slice(0,latest?1:undefined);
 async function more(){if(!before)return;try{const result=await session.chatRead('/me/postcards?before='+before);if(!wire.postcards(result))throw new Error();if(alive.current&&session.state.account?.id===owner){older.current=[...older.current,...result.items];setItems(previous=>[...previous,...result.items.filter(p=>!previous.some(n=>n.tripId===p.tripId))]);setBefore(result.before);}}catch{setError('明信片暂时未能同步。');}}
 return <>{shown.length?shown.map(p=><View key={p.tripId} style={styles.card}>{p.job.image?<Picture session={session} image={p.job.image}/>:<Postcard itemId={p.theme} date={p.createdAt}/>}<Copy style={styles.note}>{['queued','submitted','saving'].includes(p.job.status)?'明信片绘制中，旅行奖励已领取':p.job.image?'旅途明信片 · '+new Date(p.createdAt).toLocaleDateString():'旅途明信片 · 原创插画'}</Copy></View>):children}{!latest&&before&&<Action label="查看更多明信片" onPress={()=>{void more();}}/>}{!!error&&<Copy>{error}</Copy>}</>;
}
const styles=StyleSheet.create({row:{flexDirection:'row',gap:8,alignItems:'center'},task:{gap:5,padding:10,borderRadius:10,backgroundColor:'#fffaf0'},note:{fontSize:11,lineHeight:18,color:colors.muted},viewer:{flex:1,padding:24,paddingTop:60,backgroundColor:'#f9f2e5'},card:{alignItems:'center',padding:12,gap:8,backgroundColor:'#fffdf6',borderRadius:8,marginVertical:8}});
