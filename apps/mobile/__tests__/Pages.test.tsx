import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {Pressable,TextInput,Switch} from 'react-native';
import {AuthPage,BagPage,CollectionPage,TripPage,SettingsPage,ReturnPage,PasswordPage} from '../src/screens/Pages';
import type {Session,SessionState} from '../src/session/Session';
const state:SessionState={restoring:false,restorePending:false,account:{id:'a',email:'cat@example.test',username:'cat'},snapshot:{player:{id:'p',accountId:'a',username:'cat'},pet:{id:'cat',speciesId:'calico',nickname:'小猫',status:'AT_HOME'},inventory:[{itemId:'test_food',quantity:3},{itemId:'test_supply',quantity:0}],collection:[],activeTrip:null,revision:1,serverNow:'2026-10-20T00:00:00Z',configVersion:'v1'},busy:false,online:true,pending:null,error:null,rewards:[]};
function setup(){const session={state,clearError:jest.fn(),authenticate:jest.fn(async()=>true),startTrip:jest.fn(async()=>{}),claimTrip:jest.fn(async()=>{}),changePassword:jest.fn(async()=>{}),logout:jest.fn(async()=>{}),refresh:jest.fn(async()=>{}),secondsRemaining:()=>0} as unknown as Session;return {session,state,open:jest.fn()};}
const mounted:Renderer.ReactTestRenderer[]=[];
async function render(node:React.ReactElement){let tree!:Renderer.ReactTestRenderer;await act(async()=>{tree=Renderer.create(node);});mounted.push(tree);return tree;}
const button=(tree:Renderer.ReactTestRenderer,label:string)=>tree.root.findAll(n=>n.props.accessibilityLabel===label && typeof n.props.onPress==='function')[0];
afterEach(async()=>{await act(async()=>{mounted.splice(0).forEach(tree=>tree.unmount());});jest.clearAllMocks();});
test('login requires valid fields and clears password after submit',async()=>{
 const p=setup();const tree=await render(<AuthPage {...p}/>);expect(button(tree,'登录并回家').props.disabled).toBe(true);
 await act(async()=>{tree.root.findAllByType(TextInput)[0].props.onChangeText('cat@example.test');tree.root.findAllByType(TextInput)[1].props.onChangeText('123456789012345');});
 await act(async()=>button(tree,'登录并回家').props.onPress());expect(p.session.authenticate).toHaveBeenCalledWith('cat@example.test','123456789012345',false,undefined);expect(tree.root.findAllByType(TextInput)[1].props.value).toBe('');
});
test('registration collects email and a Unicode display name with a nine-character password',async()=>{
 const p=setup();const tree=await render(<AuthPage {...p}/>);
 expect(JSON.stringify(tree.toJSON())).not.toContain('小日子，慢慢收藏');
 await act(async()=>button(tree,'第一次来，创建账号').props.onPress());
 const fields=()=>tree.root.findAllByType(TextInput);
 expect(fields()).toHaveLength(3);expect(fields()[0].props.keyboardType).toBe('email-address');
 await act(async()=>{fields()[0].props.onChangeText(' ALICE@EXAMPLE.TEST ');fields()[1].props.onChangeText(' 小家 ');fields()[2].props.onChangeText('🐈'.repeat(8));});
 expect(button(tree,'创建账号并回家').props.disabled).toBe(true);
 await act(async()=>fields()[2].props.onChangeText('🐈'.repeat(9)));
 expect(button(tree,'创建账号并回家').props.disabled).toBe(false);
 await act(async()=>button(tree,'创建账号并回家').props.onPress());
 expect(p.session.authenticate).toHaveBeenCalledWith('alice@example.test','🐈'.repeat(9),true,'小家');
});
test('bag disables exhausted stock; selection does not consume inventory and can be removed',async()=>{
 const p=setup();const tree=await render(<BagPage {...p}/>);expect(button(tree,'旅行用品').props.disabled).toBe(true);expect(button(tree,'带好行囊，出发').props.disabled).toBe(true);
 await act(async()=>button(tree,'旅行食物').props.onPress());expect(button(tree,'旅行食物').props.accessibilityState.checked).toBe(true);expect(p.state.snapshot?.inventory[0].quantity).toBe(3);
 await act(async()=>button(tree,'旅行食物').props.onPress());expect(button(tree,'带好行囊，出发').props.disabled).toBe(true);
});
test('offline bag cannot start a trip',async()=>{
 const p=setup();const tree=await render(<BagPage {...p} state={{...state,online:false}}/>);await act(async()=>button(tree,'旅行食物').props.onPress());expect(button(tree,'带好行囊，出发').props.disabled).toBe(true);
});
test('zero countdown cannot unlock claiming before server readiness',async()=>{
 const p=setup();const snapshot={...state.snapshot!,activeTrip:{id:'t',status:'TRAVELING' as const,startedAt:state.snapshot!.serverNow,returnAt:state.snapshot!.serverNow,configVersion:'v1',destinationId:'forest'}};
 const tree=await render(<TripPage {...p} state={{...state,snapshot}}/>);expect(button(tree,'打开带回的礼物')).toBeUndefined();expect(JSON.stringify(tree.toJSON())).toContain('正在确认归来状态');
});
test('empty collection renders without fabricating rewards',async()=>{const tree=await render(<CollectionPage state={state}/>);expect(JSON.stringify(tree.toJSON())).toContain('第一张明信片');});
test('settings persist through callback and clear passwords on change',async()=>{
 const p=setup();const onPreferences=jest.fn();const tree=await render(<SettingsPage {...p} preferences={{automatic:true,reduced:false}} onPreferences={onPreferences}/>);
 await act(async()=>tree.root.findAllByType(Switch)[1].props.onValueChange(true));expect(onPreferences).toHaveBeenCalledWith({automatic:true,reduced:true});
 await act(async()=>tree.update(<PasswordPage {...p}/>));
 await act(async()=>{tree.root.findAllByType(TextInput)[0].props.onChangeText('old-password');tree.root.findAllByType(TextInput)[1].props.onChangeText('123456789012345');});
 await act(async()=>button(tree,'确认修改').props.onPress());expect(p.session.changePassword).toHaveBeenCalledWith('old-password','123456789012345');expect(tree.root.findAllByType(TextInput).every(n=>n.props.value==='')).toBe(true);
});
test('confirmed rewards open collection without claiming again',async()=>{const p=setup();const tree=await render(<ReturnPage {...p} state={{...state,rewards:[{itemId:'test_postcard_stream',quantity:1}]}}/>);await act(async()=>button(tree,'翻开相册').props.onPress());expect(p.open).toHaveBeenCalledWith('collection');expect(p.session.claimTrip).not.toHaveBeenCalled();});
