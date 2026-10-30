import React,{useEffect,useRef,useState} from 'react';
import {Alert,AppState,PermissionsAndroid,Platform,StyleSheet,Text,TextInput,View} from 'react-native';
import type {CatSurface,ChatHistory,ChatTurnView,PetMemories} from '../../../../packages/contracts/src/index';
import {Session} from '../session/Session';
import type {PlatformBridge} from '../session/platform';
import * as wire from '../session/chat-wire';
import {Action,colors,Copy,Page,s} from './shared';
import {Picture,ImageTask,useImageDraft,imageErrors,ImageBudget} from './Images';
const errors:Record<string,string>={MEMORY_NOT_ALLOWED:'图片内容、密码、密钥或明确要求不记住的内容不能保存为记忆。',NETWORK:'连接中断，已发送的消息可以核对重试。',CHAT_PENDING:'还有一个操作等待确认，请先核对重试。',CHAT_BUSY:'正在回复，稍后再发送。',CHAT_NOT_CONFIGURED:'聊天服务尚未配置。',CHAT_DAILY_LIMIT:'今天的聊天额度已用完，明天再聊。',CHAT_CONTEXT_CHANGED:'记忆已更新，请重新发送这条消息。',ASR_NOT_CONFIGURED:'语音服务待配置，先用文字聊聊。',ASR_BUSY:'正在识别上一段录音。',ASR_FAILED:'没有识别成功，请重新录音或输入文字。',ASR_TIMEOUT:'识别超时，请重新录音。',MICROPHONE_DENIED:'需要麦克风权限才能录音，你也可以继续打字。',STORAGE:'无法保存待确认操作，请稍后重试。',INVALID_AUDIO:'录音无效，请重新录制。'};
const message=(e:unknown)=>errors[e instanceof Error?e.message:String(e)]??imageErrors[e instanceof Error?e.message:String(e)]??'暂时未能完成，请重试。';
const activities:Record<string,string>={approach:'靠近',rest:'休息',sleep:'睡觉',eat:'进食',drink:'喝水',toilet:'上厕所',read:'看书',watch:'观察',sniff:'探索',retreat:'退开'};
function invitation(turn:ChatTurnView){const i=turn.invitation;if(!i)return '';return `${activities[i.activity]} · ${i.stage==='completed'?'已完成':i.stage==='started'?'已开始':i.stage==='blocked'?'行动未完成，已中断':i.outcome==='accepted'?'已接受邀请，等待行动':i.outcome==='declined'?'这次不想行动':i.outcome==='deferred'?'暂时保持当前活动':'旅途中，暂不能在家行动'}`;}
export function ChatPage({session,platform,surface,initialMode='chat'}:{session:Session;platform:PlatformBridge;surface:CatSurface;initialMode?:'chat'|'create'|'memories'}) {
 const[history,setHistory]=useState<ChatHistory|null>(null),[older,setOlder]=useState<ChatTurnView[]>([]),[olderCursor,setOlderCursor]=useState<string|null|undefined>(undefined);
 const[draft,setDraft]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[showMemories,setShowMemories]=useState(initialMode==='memories'),[recording,setRecording]=useState(false),[speechId,setSpeechId]=useState<string|null>(null),[seconds,setSeconds]=useState(0);
 const alive=useRef(true),locked=useRef(false),recordingRef=useRef(false),speechRef=useRef<string|null>(null),stopTimer=useRef<ReturnType<typeof setTimeout>|null>(null),latest=useRef<ChatHistory|null>(null),cursors=useRef<Record<string,number>>({});
 const earlier=useRef<ChatTurnView[]>([]);earlier.current=older;
 const[toolProgress,setToolProgress]=useState<Record<string,string>>({});
 const owner=session.state.account?.id;
 const current=()=>alive.current&&session.state.account?.id===owner;
 const images=useImageDraft(session,platform,current),[imageIntent,setImageIntent]=useState(initialMode==='create'),pendingSend=useRef(false);
 function accept(next:ChatHistory){if(!current())return;latest.current=next;setHistory(next);for(const t of next.turns)if(t.invitation?.life)session.acceptChatLife(t.invitation.life);}
 async function refresh(){const data=await session.chatRead('/me/pet/chat');if(!wire.history(data)||data.petId!==session.state.snapshot?.pet.id)throw new Error('INVALID_RESPONSE');accept(data);}
 async function action(work:()=>Promise<unknown>,reload=true){if(locked.current)return;locked.current=true;setBusy(true);setError('');try{await work();if(current()&&reload)await refresh();}catch(e){if(current())setError(message(e));}finally{locked.current=false;if(current())setBusy(false);}}
 async function imageAction(turnId:string,path:string){await action(async()=>{
  await session.chatWrite(path,{});
  const result=await session.chatRead(`/me/pet/chat/${turnId}/events?after=0`);
  if(!wire.events(result)||result.turn.id!==turnId)throw new Error('INVALID_RESPONSE');
  if(current())setOlder(previous=>previous.map(turn=>turn.id===turnId?result.turn:turn));
 });}
 useEffect(()=>{
  alive.current=true;let timer:ReturnType<typeof setTimeout>;let tick=0;
  const poll=async()=>{
   if(!current())return;
   if(AppState.currentState==='active')try{
    const h=latest.current;
    const visible=h?[...earlier.current.filter(t=>!h.turns.some(n=>n.id===t.id)),...h.turns]:[];
    const running=visible.filter(t=>['queued','running'].includes(t.status)||(t.status==='completed'&&t.memoryStatus==='pending')||(t.imageJob&&['queued','submitted','saving'].includes(t.imageJob.status))||(t.invitation?.outcome==='accepted'&&!['completed','blocked'].includes(t.invitation.stage))).slice(-4);
    if(!h||tick++%5===0)await refresh();
    else for(const t of running){const result=await session.chatRead(`/me/pet/chat/${t.id}/events?after=${cursors.current[t.id]??0}`);if(!wire.events(result)||result.turn.id!==t.id)throw new Error('INVALID_RESPONSE');if(current()&&latest.current){cursors.current[t.id]=result.cursor;for(const e of result.events){if(e.type==='status'&&typeof e.data.tool==='string'&&typeof e.data.status==='string')setToolProgress(previous=>({...previous,[t.id]:e.data.status==='in_progress'?(e.data.tool==='invite_pet'?'正在询问它的意愿…':'正在查看它的状态…'):''}));}accept({...latest.current,turns:latest.current.turns.map(item=>item.id===t.id?result.turn:item)});setOlder(previous=>previous.map(item=>item.id===t.id?result.turn:item));}}
    if(speechRef.current){const result=await session.chatRead('/me/pet/speech/'+speechRef.current);if(!wire.speech(result))throw new Error('INVALID_RESPONSE');if(current()&&['completed','failed','cancelled'].includes(result.status)){speechRef.current=null;setSpeechId(null);if(result.status==='completed')setDraft(previous=>[previous,result.text].filter(Boolean).join('\n').slice(0,4000));else if(result.error)setError(message(new Error(result.error)));}}
   }catch(e){if(current())setError(message(e));}
   if(current())timer=setTimeout(poll,1000);
  };
  void session.checkChatPending().catch(()=>{if(current())setError(errors.STORAGE);});void poll();
  const sub=AppState.addEventListener('change',state=>{if(state!=='active'&&recordingRef.current){recordingRef.current=false;void platform.cancelRecording?.();setRecording(false);if(stopTimer.current)clearTimeout(stopTimer.current);}});
  return()=>{alive.current=false;clearTimeout(timer);sub.remove();if(stopTimer.current)clearTimeout(stopTimer.current);void platform.cancelRecording?.();const job=speechRef.current;if(job&&session.state.account?.id===owner)void session.speechWrite(`/me/pet/speech/${job}/cancel`,{},platform.newKey()).catch(()=>{});};
 },[session,platform,owner]);
 async function send(){const text=draft.trim();if((!text&&!images.ids.length)||!images.ready)return;await action(async()=>{pendingSend.current=true;await session.chatWrite('/me/pet/chat',{text,surface,...(images.ids.length?{imageIds:images.ids}:{}),...(imageIntent?{imageIntent:true}:{})});if(current()){pendingSend.current=false;setDraft('');images.clear();setImageIntent(false);}});}
 async function stopRecording(){if(stopTimer.current)clearTimeout(stopTimer.current);recordingRef.current=false;setRecording(false);await action(async()=>{const audio=await platform.stopRecording!();if(!current())return;const id=wire.replyId(await session.speechWrite('/me/pet/speech',audio,platform.newKey()));if(current()){speechRef.current=id;setSpeechId(id);}});}
 async function startRecording(){if(locked.current)return;if(!platform.startRecording||!platform.stopRecording){setError('请更新原生应用以启用录音。');return;}locked.current=true;setBusy(true);try{
   if(Platform.OS==='android'&&await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)!==PermissionsAndroid.RESULTS.GRANTED)throw new Error('MICROPHONE_DENIED');
   await platform.startRecording();if(!current()||AppState.currentState!=='active'){await platform.cancelRecording?.();return;}setError('');setSeconds(0);recordingRef.current=true;setRecording(true);stopTimer.current=setTimeout(()=>{void stopRecording();},60000);
  }catch(e){if(current())setError(message(e));}finally{locked.current=false;if(current())setBusy(false);}}
 useEffect(()=>{if(!recording)return;const timer=setInterval(()=>setSeconds(n=>n+1),1000);return()=>clearInterval(timer);},[recording]);
 const active=history?.turns.find(t=>['queued','running'].includes(t.status));
 const before=olderCursor===undefined?history?.before:olderCursor;
 const turns=[...older.filter(t=>!history?.turns.some(n=>n.id===t.id)),...(history?.turns??[])];
 if(showMemories)return <MemoryPage session={session} close={()=>{setShowMemories(false);void refresh().catch(e=>{if(current())setError(message(e));});}}/>;
 return <Page title={initialMode==='create'?'画点新想法':'和它聊聊'} subtitle="AI 宠物伙伴 · 记忆可随时管理" followEnd footer={<View style={{gap:6}}>
  {session.state.chatPending&&<Action label="核对并重试上次操作" disabled={busy} onPress={()=>{void action(async()=>{await session.retryChatWrite();if(current()&&pendingSend.current){pendingSend.current=false;setDraft('');images.clear();setImageIntent(false);}});}}/>}
  {!recording&&images.controls}
  <TextInput accessibilityLabel="聊天消息" placeholder={imageIntent?'描述想画什么，或怎样修改选中的照片':'今天想和它说什么？'} placeholderTextColor={colors.muted} value={draft} onChangeText={setDraft} multiline maxLength={4000} style={[s.input,{maxHeight:100}]} editable={!recording}/>
  <Action label={imageIntent?'取消本次生图模式':history?.imageEnabled?'画一张':'生图待配置'} disabled={busy||recording||!history?.imageEnabled} onPress={()=>setImageIntent(!imageIntent)}/>
  {imageIntent&&<ImageBudget session={session}/>}
  <View style={styles.actions}><View style={{flex:1}}><Action label={active?'停止回复':imageIntent?'发送绘图请求':'发送'} primary disabled={busy||recording||images.working||!images.ready||!!session.state.chatPending||(!active&&((!draft.trim()&&!images.ids.length)||!history?.chatEnabled))} onPress={()=>{void(active?action(()=>session.chatWrite(`/me/pet/chat/${active.id}/stop`,{})):send());}}/></View>
   <Action label={recording?`结束录音 ${seconds}s`:speechId?'正在识别…':history?.speechEnabled?'语音输入':'语音待配置'} disabled={busy||!!speechId||!history?.speechEnabled} onPress={()=>{void(recording?stopRecording():startRecording());}}/>
  </View>
  {recording&&<Action label="取消录音" onPress={()=>{if(stopTimer.current)clearTimeout(stopTimer.current);recordingRef.current=false;void platform.cancelRecording?.();setRecording(false);}}/>}
 </View>}>
  {initialMode==='create'&&<Copy>画一只新伙伴，或想象一个新的小家。这里生成的是插画；成为能互动的宠物和家具，还需要后续制作。</Copy>}
  <Action label="管理长期记忆" disabled={recording||busy} onPress={()=>setShowMemories(true)}/>
  {!!error&&<Text accessibilityRole="alert" style={s.alertCopy}>{error}</Text>}
  {!history?<Copy>正在读取聊天…</Copy>:!history.chatEnabled?<Copy>聊天服务待配置。</Copy>:turns.length===0?<Copy>说说今天的心情，也可以邀请它过来陪你。</Copy>:null}
  {before&&<Action label="查看更早的消息" disabled={busy} onPress={()=>{void action(async()=>{const data=await session.chatRead('/me/pet/chat?before='+before);if(!wire.history(data))throw new Error('INVALID_RESPONSE');if(current()){setOlder(previous=>[...data.turns,...previous]);setOlderCursor(data.before);}},false);}}/>}
  {turns.map(turn=><View key={turn.id} style={styles.exchange}>
   <View style={styles.user}><Copy>{turn.userText}</Copy><View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{turn.images?.map(image=><Picture key={image.id} session={session} image={image} small/>)}</View></View>
   <View style={styles.pet}><Copy>{turn.reply||(['queued','running'].includes(turn.status)?'正在想一想…':turn.status==='cancelled'?'已停止回复。':'回复未完成。')}</Copy></View>
   {['queued','running'].includes(turn.status)&&!!toolProgress[turn.id]&&<Copy style={styles.note}>{toolProgress[turn.id]}</Copy>}
   {!!turn.invitation&&<Copy style={styles.note}>{invitation(turn)}</Copy>}
   {turn.imageJob&&<ImageTask session={session} job={turn.imageJob} busy={busy||recording||!!session.state.chatPending} write={path=>{void imageAction(turn.id,path);}}/>}
   {!!turn.images?.length&&<Copy style={styles.note}>图片内容不会进入长期记忆</Copy>}
   {turn.status==='completed'&&<Copy style={styles.note}>{turn.memoryStatus==='pending'?'正在整理记忆':turn.memoryStatus==='unavailable'?'长期记忆暂不可用':'记忆已整理'}</Copy>}
   {turn.status==='failed'&&<Action label="重试这次回复" disabled={busy||!!active||recording} onPress={()=>{void action(()=>session.chatWrite(`/me/pet/chat/${turn.id}/retry`,{}));}}/>}
   <Action label="删除这段对话" disabled={busy||recording} onPress={()=>Alert.alert('删除对话','删除这一问一答并重建当前上下文。已保存的长期记忆可在记忆页另行删除。',[{text:'取消',style:'cancel'},{text:'删除',style:'destructive',onPress:()=>{void action(async()=>{await session.chatWrite(`/me/pet/chat/${turn.id}/delete`,{});if(current())setOlder(previous=>previous.filter(item=>item.id!==turn.id));});}}])}/>
  </View>)}
 </Page>;
}
function MemoryPage({session,close}:{session:Session;close:()=>void}) {
 const[data,setData]=useState<PetMemories|null>(null),[editing,setEditing]=useState<string|null>(null),[text,setText]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const alive=useRef(true),locked=useRef(false);const owner=session.state.account?.id;const valid=()=>alive.current&&session.state.account?.id===owner;
 async function reload(){const result=await session.chatRead('/me/pet/memories');if(!wire.memories(result))throw new Error('INVALID_RESPONSE');if(valid())setData(result);}
 useEffect(()=>{alive.current=true;void reload().catch(e=>{if(valid())setError(message(e));});return()=>{alive.current=false;};},[session,owner]);
 async function write(path:string,body:Record<string,unknown>={}){if(locked.current)return;locked.current=true;setBusy(true);try{await session.chatWrite(path,body);if(valid()){setEditing(null);await reload();}}catch(e){if(valid())setError(message(e));}finally{locked.current=false;if(valid())setBusy(false);}}
 return <Page title="它记得的事" footer={<Action label="回到聊天" onPress={close}/>}>
  <Copy>记忆会用于以后的聊天。修改或删除后会重新建立当前对话上下文，历史消息仍可单独管理。</Copy>
  {!!error&&<Text accessibilityRole="alert" style={s.alertCopy}>{error}</Text>}
  {data?.status!=='ready'&&<Copy>{data?.status==='unavailable'?'长期记忆服务暂不可用。':'正在同步记忆。'}</Copy>}
  {data?.items.length===0&&<Copy>还没有长期记忆。</Copy>}
  {data?.items.map(item=><View key={item.id} style={styles.exchange}>
   {editing===item.id?<><TextInput accessibilityLabel="修改记忆" value={text} onChangeText={setText} multiline maxLength={1000} style={s.input}/><Action label="保存记忆" disabled={busy||!text.trim()} onPress={()=>{void write(`/me/pet/memories/${item.id}/update`,{text});}}/></>:<Copy>{item.text}</Copy>}
   <Copy style={styles.note}>{new Date(item.updatedAt).toLocaleString()} · {item.sourceTurnId?'来源：对话或共同经历':'主人修订或来源对话已删除'}</Copy>
   {item.sourceTurnId&&<Action label="查看记忆来源" onPress={()=>{void session.chatRead(`/me/pet/chat/${item.sourceTurnId}/events`).then(value=>{if(!wire.events(value))throw new Error('INVALID_RESPONSE');if(valid())Alert.alert('记忆来源',[value.turn.userText,invitation(value.turn)].filter(Boolean).join('\n'));}).catch(e=>{if(valid())setError(message(e));});}}/>}
   <View style={styles.actions}><Action label="修改" disabled={busy} onPress={()=>{setEditing(item.id);setText(item.text);}}/><Action label="忘记这件事" disabled={busy} onPress={()=>{void write(`/me/pet/memories/${item.id}/delete`);}}/></View>
  </View>)}
  {!!data?.items.length&&<Action label="清空全部记忆" disabled={busy} onPress={()=>Alert.alert('清空长期记忆','清空后不会再用于未来回复，聊天记录仍可单独管理。',[{text:'取消',style:'cancel'},{text:'清空',style:'destructive',onPress:()=>{void write('/me/pet/memories/clear');}}])}/>}
 </Page>;
}
const styles=StyleSheet.create({actions:{flexDirection:'row',alignItems:'center',gap:8},exchange:{gap:6,paddingVertical:12,borderBottomWidth:1,borderBottomColor:colors.line},user:{alignSelf:'flex-end',maxWidth:'92%',padding:12,borderRadius:12,backgroundColor:colors.selected},pet:{alignSelf:'flex-start',padding:12,borderRadius:12,backgroundColor:'#fffdf6'},note:{fontSize:11,lineHeight:18,color:colors.muted}});
