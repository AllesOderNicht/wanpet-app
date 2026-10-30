import React from 'react';
import {AppState,Switch,TextInput} from 'react-native';
import Renderer,{act} from 'react-test-renderer';
import {AppShell} from '../src/AppShell';
import type {Session,SessionState} from '../src/session/Session';
import type {PlatformBridge} from '../src/session/platform';
import type {CatLifeView,PetProfileView} from '../../../packages/contracts/src/index';
jest.mock('../src/game/GameSurface',()=>({GameSurface:(props:any)=>require('react').createElement('GameSurface',props)}));
jest.mock('../src/game/engine',()=>({sendScene:jest.fn(async()=>true)}));
const state:SessionState={restoring:false,restorePending:false,account:{id:'a',email:'cat@example.test',username:'cat'},snapshot:{player:{id:'p',accountId:'a',username:'cat'},pet:{id:'c',speciesId:'cat',nickname:'小猫',status:'AT_HOME'},inventory:[],collection:[],revision:1,configVersion:'v1',serverNow:'2026-10-20T00:00:00Z',activeTrip:null},online:true,busy:false,pending:null,error:null,rewards:[]};
const petId='00000000-0000-0000-0000-000000000001',memoryId='00000000-0000-0000-0000-000000000002';
const profile:PetProfileView={petId,revision:7,nickname:'小丸',speciesId:'cat',description:'喜欢安静的窗边',voice:'gentle',temperament:{curiosity:.4,sociability:.5,sensitivity:.3},updatedAt:'2026-10-29T00:00:00Z'};
const life:CatLifeView={petId,revision:9,serverNow:profile.updatedAt,temperament:profile.temperament,needs:{hunger:.3,fatigue:.2,stimulation:.5,alertness:.1},preferences:{sunny:.5,shelter:.5,food:.5,nearby:.5},cushion:'shelter',automatic:true,intent:null,memories:[],decisionSource:'rules',version:2,body:{thirst:.4,bowel:.3,cleanliness:.8},facilities:{food:{portions:1,reservedBy:null},water:{portions:1,reservedBy:null},toilet:{cleanliness:.5,uses:2},reading:{bookId:'book',sessions:1}},profile:{...profile,revision:6,nickname:'旧名字'},activities:[{id:'read',label:'看绘本',spot:'reading',available:true,reason:null}]};
const careState:SessionState={...state,snapshot:{...state.snapshot!,pet:{...state.snapshot!.pet,id:petId}},life,profile};
const trees:Renderer.ReactTestRenderer[]=[];
beforeEach(()=>{AppState.currentState='active';});
afterEach(async()=>{await act(async()=>trees.splice(0).forEach(t=>t.unmount()));});
function bridge(){return {resourcePath:'/bundle',apiBaseURL:'https://example.test/v1',readCredential:jest.fn(async()=>null),writeCredential:jest.fn(async()=>{}),removeCredential:jest.fn(async()=>{}),read:jest.fn(async()=>null),write:jest.fn(async()=>{}),remove:jest.fn(async()=>{}),newKey:()=> 'a'.repeat(48),nowMilliseconds:()=>100,request:jest.fn()} as PlatformBridge;}
async function render(value=state,platform=bridge()){const session={state:value,getSnapshot:()=>value,subscribe:()=>()=>{},restore:jest.fn(async()=>{}),refresh:jest.fn(async()=>{}),advanceLife:jest.fn(async()=>{}),care:jest.fn(async()=>{}),saveProfile:jest.fn(async()=>{}),checkChatPending:jest.fn(async()=>{}),acceptChatLife:jest.fn(),chatWrite:jest.fn(async()=>({id:memoryId})),chatRead:jest.fn(async(path:string)=>path==='/me/pet/memories'?{items:[{id:memoryId,text:'它喜欢靠窗的软垫',sourceTurnId:null,updatedAt:profile.updatedAt}],status:'ready'}:path==='/me/pet/images/budget'?null:{petId:value.snapshot?.pet.id,turns:[],before:null,chatEnabled:true,speechEnabled:false,imageEnabled:true}),secondsRemaining:()=>0} as unknown as Session;let tree!:Renderer.ReactTestRenderer;await act(async()=>{tree=Renderer.create(<AppShell session={session} platform={platform}/>);});trees.push(tree);return tree;}
const sessionOf=(tree:Renderer.ReactTestRenderer)=>tree.root.findByType(AppShell).props.session as jest.Mocked<Session>;
const field=(tree:Renderer.ReactTestRenderer,label:string)=>tree.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel===label)!;
async function click(tree:Renderer.ReactTestRenderer,label:string){const control=tree.root.findAll(n=>n.props.accessibilityLabel===label&&typeof n.props.onPress==='function')[0];expect(control).toBeDefined();await act(async()=>control.props.onPress());}
test('home to bag and back keeps one game host mounted',async()=>{const tree=await render();const original=tree.root.findByType('GameSurface' as any);await click(tree,'行囊');expect(JSON.stringify(tree.toJSON())).toContain('带一点心意');expect(tree.root.findByType('GameSurface' as any)).toBe(original);await click(tree,'返回上一页');expect(tree.root.findByType('GameSurface' as any)).toBe(original);});
test('menu opens settings and can return home',async()=>{const tree=await render();await click(tree,'设置');expect(JSON.stringify(tree.toJSON())).toContain('自在活动');await click(tree,'返回上一页');expect(tree.root.findByType('GameSurface' as any).props.surface).toBe('interior');});
test('courtyard command changes game surface without recreating shell',async()=>{const tree=await render();await click(tree,'门外');expect(tree.root.findByType('GameSurface' as any).props.surface).toBe('courtyard');});
test('unauthenticated state renders login and never starts game host',async()=>{const tree=await render({...state,account:null,snapshot:null});expect(JSON.stringify(tree.toJSON())).toContain('登录并回家');expect(tree.root.findAllByType('GameSurface' as any)).toHaveLength(0);});
test('corrupt pending journal has no retry write action',async()=>{const tree=await render({...state,pending:'invalid'});await click(tree,'设置');expect(JSON.stringify(tree.toJSON())).toContain('待确认记录损坏');expect(tree.root.findAll(n=>n.props.accessibilityLabel==='核对并重试')).toHaveLength(0);});

test('settings block overlapping saves and retain confirmed preferences on failure',async()=>{
 const platform=bridge();let reject!:(reason:Error)=>void;
 (platform.write as jest.Mock).mockImplementationOnce(()=>new Promise<void>((_,fail)=>{reject=fail;}));
 const tree=await render(state,platform);await click(tree,'设置');
 await act(async()=>tree.root.findAllByType(Switch)[0].props.onValueChange(false));
 expect(tree.root.findAllByType(Switch).every(n=>n.props.disabled)).toBe(true);
 await act(async()=>tree.root.findAllByType(Switch)[1].props.onValueChange(true));
 expect(platform.write).toHaveBeenCalledTimes(1);
 await act(async()=>reject(new Error('disk unavailable')));
 expect(tree.root.findAllByType(Switch)[0].props.value).toBe(true);
 expect(tree.root.findAllByType(Switch).every(n=>!n.props.disabled)).toBe(true);
 expect(JSON.stringify(tree.toJSON())).toContain('设置没有保存');
});

test('home opens cat observations without recreating the game host',async()=>{const tree=await render();const original=tree.root.findByType('GameSurface' as any);await click(tree,'状态');expect(JSON.stringify(tree.toJSON())).toContain('留一处舒服的位置');expect(JSON.stringify(tree.toJSON())).toContain('最近的小事');await click(tree,'回去陪它');expect(tree.root.findByType('GameSurface' as any)).toBe(original);});

test('home profile entry saves the latest profile revision without remounting the game',async()=>{
 const tree=await render(careState),session=sessionOf(tree),original=tree.root.findByType('GameSurface' as any);
 await click(tree,'状态');await click(tree,'编辑宠物画像');expect(field(tree,'宠物昵称').props.value).toBe('小丸');
 await act(async()=>field(tree,'宠物昵称').props.onChangeText('小团'));await click(tree,'保存小伙伴资料');
 expect(session.saveProfile).toHaveBeenCalledWith(expect.objectContaining({expectedRevision:7,nickname:'小团'}));
 await click(tree,'返回状态');expect(JSON.stringify(tree.toJSON())).toContain('留一处舒服的位置');expect(tree.root.findByType('GameSurface' as any)).toBe(original);
});
test('home care entry forwards food sources and invites on the selected courtyard surface',async()=>{
 const tree=await render(careState),session=sessionOf(tree);await click(tree,'门外');await click(tree,'状态');
 await click(tree,'添一份基础口粮');await click(tree,'用一份背包食物');await click(tree,'邀请它看绘本');
 expect(session.care.mock.calls).toEqual([['feed','basic'],['feed','inventory']]);
 expect(session.advanceLife).toHaveBeenLastCalledWith({surface:'courtyard',event:'invite',intentId:null,target:'sunny',invitedActivity:'read',automatic:true});
});
test('home creation entry sends an image request through chat',async()=>{
 const tree=await render(careState),session=sessionOf(tree),original=tree.root.findByType('GameSurface' as any);await click(tree,'聊天');await click(tree,'画一张');
 await act(async()=>field(tree,'聊天消息').props.onChangeText('画一间有蓝色窗帘的小屋'));await click(tree,'发送绘图请求');
 expect(session.chatWrite).toHaveBeenCalledWith('/me/pet/chat',{text:'画一间有蓝色窗帘的小屋',surface:'interior',imageIntent:true});
 await click(tree,'返回上一页');expect(tree.root.findByType('GameSurface' as any)).toBe(original);
});

test('tapping the room table forwards the reading invitation to the existing life API',async()=>{
 const tree=await render(careState),session=sessionOf(tree);
 await act(async()=>tree.root.findByType('GameSurface' as any).props.onEvent({type:'life_request',surface:'interior',event:'invite',intentId:null,target:'sunny',invitedActivity:'read'}));
 expect(session.advanceLife).toHaveBeenLastCalledWith({surface:'interior',event:'invite',intentId:null,target:'sunny',invitedActivity:'read',automatic:true});
});
test('home memories entry opens the actual memory list',async()=>{
 const tree=await render(careState),session=sessionOf(tree);await click(tree,'聊天');await click(tree,'管理长期记忆');
 expect(session.chatRead).toHaveBeenCalledWith('/me/pet/memories');expect(JSON.stringify(tree.toJSON())).toContain('它喜欢靠窗的软垫');
 expect(field(tree,'聊天消息')).toBeUndefined();expect(session.chatWrite).not.toHaveBeenCalled();
});
test('reducing motion preserves automatic life and forwards engine acknowledgements',async()=>{
 const tree=await render(careState),session=sessionOf(tree);await click(tree,'设置');const calls=session.advanceLife.mock.calls.length;
 await act(async()=>tree.root.findAllByType(Switch)[1].props.onValueChange(true));
 const game=tree.root.findByType('GameSurface' as any);expect(game.props.reduced).toBe(true);expect(game.props.automatic).toBe(true);
 expect(session.advanceLife).toHaveBeenCalledTimes(calls);
 await act(async()=>game.props.onEvent({type:'life_request',surface:'interior',event:'arrived',intentId:memoryId,target:null}));
 expect(session.advanceLife).toHaveBeenLastCalledWith({surface:'interior',event:'arrived',intentId:memoryId,target:null,automatic:true});
});
test('changing reduced motion does not send a stop observation after a manual invitation',async()=>{
 const tree=await render(careState),session=sessionOf(tree);await click(tree,'设置');
 await act(async()=>tree.root.findAllByType(Switch)[0].props.onValueChange(false));await click(tree,'返回上一页');await click(tree,'状态');await click(tree,'邀请它看绘本');
 expect(session.advanceLife).toHaveBeenLastCalledWith(expect.objectContaining({event:'invite',invitedActivity:'read',automatic:false}));
 const calls=session.advanceLife.mock.calls.length;await click(tree,'回去陪它');await click(tree,'设置');
 await act(async()=>tree.root.findAllByType(Switch)[1].props.onValueChange(true));
 expect(session.advanceLife).toHaveBeenCalledTimes(calls);expect(tree.root.findByType('GameSurface' as any).props.automatic).toBe(false);
});


test('home contains only the scene controls and ordered dock',async()=>{
 const tree=await render(careState),json=JSON.stringify(tree.toJSON());
 for(const text of ['的小家','认识这位小伙伴','今天，也一起慢慢过','共同记忆','画点新想法'])expect(json).not.toContain(text);
 const labels=[...new Set(tree.root.findAll(n=>typeof n.props.onPress==='function'&&['门外','相册','行囊'].includes(n.props.accessibilityLabel)).map(n=>n.props.accessibilityLabel))];
 expect(labels).toEqual(['门外','相册','行囊']);
});

test('dock toggles courtyard and preserves the scene when returning from pages',async()=>{
 const tree=await render(),original=tree.root.findByType('GameSurface' as any);
 await click(tree,'门外');await click(tree,'相册');await click(tree,'行囊');await click(tree,'返回上一页');
 expect(tree.root.findByType('GameSurface' as any)).toBe(original);expect(original.props.surface).toBe('courtyard');
 await click(tree,'小屋');expect(original.props.surface).toBe('interior');
});

test('utility pages hide the dock and return through their parents',async()=>{
 const tree=await render(careState);await click(tree,'状态');
 expect(tree.root.findAll(n=>n.props.accessibilityLabel==='行囊'&&typeof n.props.onPress==='function')).toHaveLength(0);
 await click(tree,'编辑宠物画像');await click(tree,'返回上一页');expect(JSON.stringify(tree.toJSON())).toContain('准备下一段旅途');
 await click(tree,'返回上一页');await click(tree,'设置');await click(tree,'管理账号');await click(tree,'返回上一页');
 expect(JSON.stringify(tree.toJSON())).toContain('自在活动');
});

test('bag draft survives tab switches without changing the game host',async()=>{
 const tree=await render({...state,snapshot:{...state.snapshot!,inventory:[{itemId:'test_food',quantity:2}]}});
 const original=tree.root.findByType('GameSurface' as any);await click(tree,'行囊');await click(tree,'旅行食物');
 await click(tree,'相册');await click(tree,'行囊');
 expect(tree.root.findAll(n=>n.props.accessibilityLabel==='旅行食物'&&n.props.accessibilityRole==='checkbox')[0].props.accessibilityState.checked).toBe(true);
 expect(tree.root.findByType('GameSurface' as any)).toBe(original);
});


test('ready trip is reached through status while the home stays quiet',async()=>{
 const readyState:SessionState={...careState,snapshot:{...careState.snapshot!,activeTrip:{id:'t',status:'READY_TO_CLAIM',startedAt:profile.updatedAt,returnAt:profile.updatedAt,configVersion:'v1',destinationId:'forest'}}};
 const tree=await render(readyState),original=tree.root.findByType('GameSurface' as any);
 expect(tree.root.findAll(n=>n.props.accessibilityLabel==='状态'&&typeof n.props.onPress==='function')[0].props.accessibilityHint).toContain('待领取');
 expect(JSON.stringify(tree.toJSON())).not.toContain('小猫在路上');
 await click(tree,'状态');await click(tree,'领取归来礼物');expect(JSON.stringify(tree.toJSON())).toContain('打开带回的礼物');
 await click(tree,'返回上一页');expect(JSON.stringify(tree.toJSON())).toContain('编辑宠物画像');
 expect(tree.root.findByType('GameSurface' as any)).toBe(original);
});

test('inactive app-switcher transition preserves rendering until background',async()=>{
 const spy=jest.spyOn(AppState,'addEventListener');spy.mockClear();
 const tree=await render();
 try{
  const listener=spy.mock.calls.find(([event])=>event==='change')![1];
  await click(tree,'门外');
  await act(async()=>listener('inactive'));
  expect(tree.root.findByType('GameSurface' as any).props.active).toBe(true);
  expect(tree.root.findByType('GameSurface' as any).props.surface).toBe('courtyard');
  await act(async()=>listener('background'));
  expect(tree.root.findByType('GameSurface' as any).props.active).toBe(false);
  await act(async()=>listener('active'));
  expect(tree.root.findByType('GameSurface' as any).props.surface).toBe('courtyard');
 }finally{spy.mockRestore();}
});
