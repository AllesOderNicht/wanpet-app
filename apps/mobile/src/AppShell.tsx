import React,{useCallback,useEffect,useRef,useState,useSyncExternalStore,type ReactNode} from 'react';
import {AccessibilityInfo,AppState,Image,Keyboard,KeyboardAvoidingView,Platform,Pressable,StatusBar,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import {CommonActions,DefaultTheme,NavigationContainer,StackActions,useNavigationContainerRef} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {SafeAreaProvider,useSafeAreaInsets} from 'react-native-safe-area-context';
import {Session} from './session/Session';
import type {PlatformBridge} from './session/platform';
import {AccountPage,AuthPage,BagPage,CollectionPage,DetailPage,LogoutPage,PasswordPage,ReturnPage,SettingsPage,TripPage,type PageName,type Preferences} from './screens/Pages';
import {Action,art,colors,Copy,Icon,Page,PanelContext,s,titleFont} from './screens/shared';
import {GlassIcon,GlassSurface} from './components/GlassSurface';
import {GameSurface} from './game/GameSurface';
import {type SceneEvent,type Surface} from './game/engine';
import {PetProfilePage} from './screens/PetProfilePage';
import {CatLifePage} from './screens/CatLifePage';
import {ChatPage} from './screens/ChatPage';
const messages:Record<string,string>={NETWORK:'暂时无法连接，请检查网络后重试。',CREDENTIAL_STORAGE:'无法读取或保存登录信息，请重试。',INVALID_EMAIL:'请填写有效的邮箱地址。',INVALID_USERNAME:'称呼需要填写1–32个字符。',INVALID_PASSWORD:'密码需要9–128个字符。',EMAIL_TAKEN:'这个邮箱已注册，请直接登录。',STORAGE:'无法读写本地待确认记录，写操作已停止。',INVALID_RESPONSE:'服务返回了无法识别的数据，请重试。',INVALID_CREDENTIALS:'邮箱或密码不正确。',USERNAME_TAKEN:'用户名已被使用。',UNAUTHENTICATED:'登录已失效，请重新登录。',INVALID_INPUT:'请检查填写内容，密码至少9个字符。',INSUFFICIENT_INVENTORY:'物品数量不足，已重新读取背包。',REVISION_CONFLICT:'存档已更新，请重新选择行囊。',ACTIVE_TRIP_EXISTS:'已有旅行，请先领取归来物品。',TRIP_NOT_READY:'小猫还在旅途中。',RATE_LIMITED:'操作较频繁，请稍后重试。',PET_BUSY:'正在保存，请稍候。',PET_PENDING:'上一条照顾或画像操作尚待确认，请先核对。',BOWL_FULL:'碗已经满了，等它吃一点再添。',FACILITY_BUSY:'它正在使用猫砂盆，出来后再清理。'};
const screens=['home','bag','collection','detail','chat','cat-life','pet-profile','trip','return','settings','account','password','logout','create','memories'] as const;
type ScreenName=typeof screens[number];
type Routes=Record<ScreenName,undefined>;
const Stack=createNativeStackNavigator<Routes>();
const theme={...DefaultTheme,colors:{...DefaultTheme.colors,background:'transparent',card:colors.paper,text:colors.ink,primary:colors.green,border:colors.line}};
const dockHeight=(scale:number)=>Math.max(56,32+16*scale);
const hasDock=(page:ScreenName)=>['home','bag','collection','detail'].includes(page);

export function AppShell(props:{session:Session;platform:PlatformBridge}) {return <SafeAreaProvider><Home {...props}/></SafeAreaProvider>;}

function ScreenFrame({children,notice,back,withDock=false,keyboardVisible=false}:{children:ReactNode;notice:ReactNode;back?:()=>void;withDock?:boolean;keyboardVisible?:boolean}) {
 const insets=useSafeAreaInsets(),window=useWindowDimensions();
 const bottom=keyboardVisible?8:withDock?Math.max(insets.bottom,12)+8+dockHeight(window.fontScale)+12:Math.max(insets.bottom,12);
 return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS==='ios'?'padding':undefined}>
  <View style={[styles.screen,{paddingTop:insets.top,paddingBottom:bottom}]}>
   <PanelContext.Provider value={{notice,back,fullScreen:true,maxHeight:window.height}}>{children}</PanelContext.Provider>
  </View>
 </KeyboardAvoidingView>;
}

function Home({session,platform}:{session:Session;platform:PlatformBridge}) {
 const state=useSyncExternalStore(session.subscribe,session.getSnapshot,session.getSnapshot);
 const insets=useSafeAreaInsets(),window=useWindowDimensions(),navigation=useNavigationContainerRef<Routes>();
 const[page,setPage]=useState<ScreenName>('home'),[room,setRoom]=useState<Surface>('interior');
 const[draft,setDraft]=useState<string[]>([]),[selected,setSelected]=useState('');
 const[prefs,setPrefs]=useState<Preferences>({automatic:true,reduced:false,labels:true});
 const[systemReduced,setSystemReduced]=useState(false),[focused,setFocused]=useState(AppState.currentState==='active');
 const[localError,setLocalError]=useState(''),[preferencesBusy,setPreferencesBusy]=useState(true),[keyboardVisible,setKeyboardVisible]=useState(false);
 const preferencesLocked=useRef(true);
 const open=useCallback((next:PageName)=>{
  Keyboard.dismiss();
  if(!navigation.isReady())return;
  if(next==='door'){setRoom(value=>value==='courtyard'?'interior':'courtyard');navigation.dispatch(StackActions.popTo('home'));return;}
  if(next==='auth')return;
  const current=navigation.getRootState();
  if(!current)return;
  if(next==='home'){navigation.dispatch(StackActions.popTo('home'));return;}
  if(next==='bag'||next==='collection'){
   if(navigation.getCurrentRoute()?.name===next)return;
   const existing=current.routes.find(route=>route.name===next);
   navigation.resetRoot({index:1,routes:[{key:current.routes[0].key,name:'home'},{key:existing?.key,name:next}]});
   return;
  }
  if(current.routes.some(route=>route.name===next))navigation.dispatch(StackActions.popTo(next));
  else navigation.dispatch(CommonActions.navigate(next));
 },[navigation]);
 const back=useCallback(()=>{Keyboard.dismiss();if(navigation.canGoBack())navigation.goBack();},[navigation]);
 const onEvent=useCallback((event:SceneEvent)=>{
  if(event.type==='life_request'&&event.surface===room)void session.advanceLife({surface:event.surface,event:event.event,intentId:event.intentId,target:event.target,...(event.invitedActivity?{invitedActivity:event.invitedActivity}:{}),automatic:prefs.automatic});
 },[session,room,prefs.automatic]);
 useEffect(()=>{void session.restore();},[session]);
 useEffect(()=>{
  if(!focused||!state.snapshot)return;
  void session.advanceLife({surface:room==='home'?'interior':room,event:'observe',intentId:null,target:null,automatic:prefs.automatic});
 },[session,focused,room,state.snapshot?.pet.id,state.snapshot?.pet.status,prefs.automatic]);
 useEffect(()=>{setDraft([]);setSelected('');setRoom('interior');setPage('home');},[state.account?.id]);
 useEffect(()=>{
  let alive=true;
  void platform.read('preferences-v1').then(raw=>{
   if(!alive||!raw)return;const value=JSON.parse(raw);
   if(typeof value.automatic==='boolean'&&typeof value.reduced==='boolean')setPrefs({automatic:value.automatic,reduced:value.reduced,labels:typeof value.labels==='boolean'?value.labels:true});
  }).catch(()=>{if(alive)setLocalError('无法读取小屋设置。');}).finally(()=>{if(alive){preferencesLocked.current=false;setPreferencesBusy(false);}});
  void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(alive)setSystemReduced(value);});
  const sub=AccessibilityInfo.addEventListener('reduceMotionChanged',setSystemReduced);
  return()=>{alive=false;sub.remove();};
 },[platform]);
 useEffect(()=>{const sub=AppState.addEventListener('change',next=>{if(next!=='inactive')setFocused(next==='active');if(next==='active')void session.refresh();});return()=>sub.remove();},[session]);
 useEffect(()=>{
  if(!state.account||!focused)return;
  const id=setInterval(()=>{if(!session.state.busy)void session.refresh();},state.snapshot?.activeTrip?5000:30000);
  return()=>clearInterval(id);
 },[session,state.account,!!state.snapshot?.activeTrip,focused]);
 useEffect(()=>{
  const show=Keyboard.addListener(Platform.OS==='ios'?'keyboardWillShow':'keyboardDidShow',()=>setKeyboardVisible(true));
  const hide=Keyboard.addListener(Platform.OS==='ios'?'keyboardWillHide':'keyboardDidHide',()=>setKeyboardVisible(false));
  return()=>{show.remove();hide.remove();};
 },[]);
 async function preferences(next:Preferences){
  if(preferencesLocked.current)return;preferencesLocked.current=true;setPreferencesBusy(true);
  try{await platform.write('preferences-v1',JSON.stringify(next));setPrefs(next);setLocalError('');}
  catch{setLocalError('设置没有保存，请重试。');}
  finally{preferencesLocked.current=false;setPreferencesBusy(false);}
 }
 async function retry(){
  const owner=state.account?.id,operation=state.pending!=='invalid'?state.pending?.operation:undefined;
  await session.retryPending();if(session.state.account?.id!==owner||session.state.pending)return;
  if(operation==='claim'&&session.state.rewards.length)open('return');
  else if(operation==='start'&&session.state.snapshot?.activeTrip){setDraft([]);open('trip');}
 }
 const loggedIn=!!state.account,playable=loggedIn&&!!state.snapshot&&!state.restoring&&!state.restorePending,courtyard=room==='courtyard';
 const trip=state.snapshot?.activeTrip,ready=trip?.status==='READY_TO_CLAIM';
 const networkMessage=state.error==='NETWORK'&&(state.pending&&state.pending!=='invalid'||state.petPending||state.chatPending)?'暂时无法连接，未确认操作已保留。':undefined;
 const error=localError||(state.petError?(messages[state.petError]??'照顾操作尚未确认，请核对后重试。'):'')||(state.error?(networkMessage??messages[state.error]??'服务暂时不可用，请重试。'):'');
 const notice=<>
  {state.petPending&&<View style={s.alert}><Copy>有一条照顾或画像操作还没确认，内容已经留好。</Copy><Action label="核对宠物操作" disabled={state.petBusy||!state.online} onPress={()=>{void session.retryPetCommand().catch(()=>{});}}/></View>}
  {!!error&&<View style={s.alert}><Text accessibilityRole="alert" style={s.alertCopy}>{error}</Text></View>}
  {loggedIn&&!state.online&&<View style={s.alert}><Copy>暂时离线，回忆仍在这里。</Copy><Action label="重新连接" disabled={state.busy} onPress={()=>{void session.refresh(true);}}/></View>}
  {state.pending&&<View style={s.alert}><Copy>{state.pending==='invalid'?'待确认记录损坏，请保留文件以便检查。':'有一个操作尚待确认，核对后再继续。'}</Copy>{state.pending!=='invalid'&&<Action label="核对并重试" disabled={state.busy||!state.online} onPress={()=>{void retry();}}/>}</View>}
 </>;
 const props={session,state,open};
 function content(name:ScreenName):ReactNode {
  switch(name){
   case 'chat':case 'create':case 'memories':return <ChatPage session={session} platform={platform} surface={courtyard?'courtyard':'interior'} initialMode={name==='create'?'create':name==='memories'?'memories':'chat'}/>;
   case 'pet-profile':return <PetProfilePage profile={state.profile??state.life?.profile} busy={!!state.petBusy||!!state.petPending} close={back} closeLabel="返回状态" onSave={async input=>{try{await session.saveProfile(input);}catch(e){throw new Error(messages[e instanceof Error?e.message:'']??'资料还没有保存成功，请核对后重试。');}}}/>;
   case 'bag':return <BagPage {...props} draft={draft} onDraftChange={setDraft}/>;
   case 'trip':return <TripPage {...props}/>;
   case 'return':return <ReturnPage {...props}/>;
   case 'collection':return <CollectionPage {...props} onSelect={id=>{setSelected(id);open('detail');}}/>;
   case 'detail':return <DetailPage {...props} itemId={selected}/>;
   case 'settings':return <SettingsPage {...props} preferences={prefs} preferencesBusy={preferencesBusy} onPreferences={next=>{void preferences(next);}}/>;
   case 'cat-life':return <CatLifePage life={state.life} nickname={state.profile?.nickname} close={()=>open('home')} busy={!!state.petBusy||!!state.petPending||!state.online||state.snapshot?.pet.status!=='AT_HOME'}
    overview={<View style={styles.overview}>
     <View style={styles.statusRow}><Text style={styles.statusName}>{state.profile?.nickname??state.snapshot?.pet.nickname}</Text><Text style={styles.statusLocation}>{trip?(ready?'已归来 · 礼物待领取':'旅行中'):courtyard?'在庭院':'在小屋'}</Text></View>
     <Action label="编辑宠物画像" icon="cat" onPress={()=>open('pet-profile')}/>
     <Action label={ready?'领取归来礼物':trip?'查看旅途':'准备下一段旅途'} icon={ready?'mail':'leaf'} onPress={()=>open('trip')}/>
    </View>}
    onCare={(operation,source)=>{void session.care(operation,source).catch(()=>{});}}
    onInvite={invitedActivity=>{void session.advanceLife({surface:courtyard?'courtyard':'interior',event:'invite',intentId:null,target:'sunny',invitedActivity,automatic:prefs.automatic});}}
    onCushion={target=>{void session.advanceLife({surface:courtyard?'courtyard':'interior',event:'move_cushion',intentId:null,target,automatic:prefs.automatic});}}/>;
   case 'account':return <AccountPage {...props}/>;
   case 'password':return <PasswordPage {...props}/>;
   case 'logout':return <LogoutPage {...props}/>;
   default:return null;
  }
 }
 let gate:ReactNode;
 if(state.restoring||state.restorePending)gate=<Page title={state.restoring?'正在找回你的小屋':'连接后就能回家'} footer={<><Action label="重新连接" primary disabled={state.restoring} onPress={()=>{void session.restore();}}/><Action label="重新登录" disabled={state.restoring} onPress={()=>{void session.logout();}}/></>}><Copy>正在恢复已保存的登录，连接失败不会清除账号。</Copy></Page>;
 else if(!loggedIn)gate=<AuthPage {...props}/>;
 else if(!state.snapshot)gate=<Page title="正在打开你的家园"><Copy>把小屋和回忆一同带回来。</Copy><Action label="重新读取存档" disabled={state.busy} onPress={()=>{void session.refresh(true);}}/></Page>;
 const bottom=Math.max(insets.bottom,12)+8,height=dockHeight(window.fontScale),warning=!!(error||state.pending||state.petPending||loggedIn&&!state.online);
 return <View style={styles.root}>
  <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent/>
  {!playable&&<Image source={art.room} resizeMode="cover" style={StyleSheet.absoluteFill} accessible={false}/>}
  {playable&&<View collapsable={false} style={StyleSheet.absoluteFill} pointerEvents={page==='home'?'auto':'none'} accessibilityElementsHidden={page!=='home'} importantForAccessibility={page==='home'?'auto':'no-hide-descendants'}>
   <GameSurface key={state.account!.id} resourcePath={platform.resourcePath} surface={room} active={focused} available={state.snapshot!.pet.status==='AT_HOME'} automatic={prefs.automatic} reduced={prefs.reduced||systemReduced} life={state.life} onEvent={onEvent}/>
  </View>}
  {playable?<>
   <View style={StyleSheet.absoluteFill} pointerEvents={page==='home'?'none':'auto'}>
    <NavigationContainer key={state.account!.id} ref={navigation} theme={theme} onReady={()=>setPage(navigation.getCurrentRoute()?.name??'home')} onStateChange={()=>setPage(navigation.getCurrentRoute()?.name??'home')}>
     <Stack.Navigator initialRouteName="home" screenOptions={{headerShown:false,gestureEnabled:true,animation:prefs.reduced||systemReduced?'none':'slide_from_right',contentStyle:{backgroundColor:colors.paper}}}>
      {screens.map(name=><Stack.Screen key={name} name={name} options={name==='home'?{contentStyle:{backgroundColor:'transparent'}}:undefined}>{()=>name==='home'?<View pointerEvents="none" style={StyleSheet.absoluteFill}/>:<ScreenFrame notice={notice} back={back} withDock={hasDock(name)} keyboardVisible={keyboardVisible}>{content(name)}</ScreenFrame>}</Stack.Screen>)}
     </Stack.Navigator>
    </NavigationContainer>
   </View>
   {page==='home'&&<View pointerEvents="box-none" style={[styles.utilities,{top:insets.top+12}]}>
    {([{name:'settings',label:'设置',page:'settings'},{name:'chat',label:'聊天',page:'chat'},{name:'status',label:'状态',page:'cat-life'}] as const).map(item=><GlassSurface key={item.name} style={styles.round}>
     <Pressable accessibilityRole="button" accessibilityLabel={item.label} accessibilityHint={item.name==='status'&&ready?'有归来礼物待领取':undefined} onPress={()=>open(item.page)} style={({pressed})=>[styles.roundPress,pressed&&styles.pressed]}>
      <GlassIcon name={item.name}/>{item.name==='status'&&ready&&<View accessible={false} style={styles.dot}/>}
     </Pressable>
    </GlassSurface>)}
   </View>}
   {hasDock(page)&&<GlassSurface style={[styles.dock,{bottom,width:Math.min(window.width-32,Math.max(280,Math.min(360,window.width*.72))),height,borderRadius:height/2}]}>
    <View style={styles.dockRow}>
     {([{page:'door',label:courtyard?'小屋':'门外',icon:courtyard?'home':'door'},{page:'collection',label:'相册',icon:'collection'},{page:'bag',label:'行囊',icon:'bag'}] as const).map(item=>{
      const active=item.page==='collection'?(page==='collection'||page==='detail'):item.page==='bag'&&page==='bag';
      return <Pressable key={item.page} accessibilityRole={item.page==='door'?'button':'tab'} accessibilityLabel={item.label} accessibilityState={item.page==='door'?undefined:{selected:active}} onPress={()=>open(item.page)} style={({pressed})=>[styles.dockItem,active&&styles.selected,pressed&&styles.pressed]}>
       <GlassIcon name={item.icon} size={21}/><Text style={[styles.dockLabel,active&&styles.selectedLabel]}>{item.label}</Text>
      </Pressable>;
     })}
    </View>
   </GlassSurface>}
   {page==='home'&&warning&&<Pressable accessibilityRole="button" accessibilityLabel="查看连接与待确认状态" onPress={()=>open('settings')} style={[styles.noticePill,{bottom:bottom+height+12}]}><Icon name="refresh" size={16}/><Text style={styles.noticeText}>{state.pending||state.petPending?'有一个操作待确认':!state.online?'暂时离线 · 轻点查看':'轻点查看提示'}</Text></Pressable>}
  </>:<ScreenFrame notice={notice} keyboardVisible={keyboardVisible}>{gate}</ScreenFrame>}
 </View>;
}
const styles=StyleSheet.create({
 root:{flex:1,backgroundColor:colors.paper},screen:{flex:1,backgroundColor:colors.paper},
 utilities:{position:'absolute',right:16,gap:10},round:{width:48,height:48,borderRadius:24},roundPress:{flex:1,alignItems:'center',justifyContent:'center',borderRadius:24},
 dock:{position:'absolute',alignSelf:'center'},dockRow:{flex:1,flexDirection:'row',padding:4,gap:2},dockItem:{flex:1,minHeight:48,borderRadius:32,justifyContent:'center',alignItems:'center',gap:2,paddingVertical:3},dockLabel:{fontSize:12,lineHeight:16,color:'#493e30',fontWeight:'500'},selected:{backgroundColor:'#e5e8d5b8'},selectedLabel:{fontWeight:'700'},pressed:{backgroundColor:'#fffaf16b'},
 dot:{position:'absolute',top:7,right:7,width:7,height:7,borderRadius:4,backgroundColor:'#a75d32'},
 overview:{paddingBottom:12,borderBottomWidth:StyleSheet.hairlineWidth,borderColor:colors.line},statusRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'},statusName:{fontFamily:titleFont,fontSize:22,color:colors.ink},statusLocation:{fontSize:13,color:colors.green},
 noticePill:{position:'absolute',alignSelf:'center',flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'#fff7e9f5',paddingHorizontal:14,minHeight:44,borderRadius:22},noticeText:{fontSize:12,color:colors.ink},
});
