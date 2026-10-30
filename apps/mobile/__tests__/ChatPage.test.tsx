import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {AppState,TextInput} from 'react-native';
import {ChatPage} from '../src/screens/ChatPage';
import type {Session} from '../src/session/Session';
import type {PlatformBridge} from '../src/session/platform';
const id='00000000-0000-0000-0000-000000000001';
let mounted:Renderer.ReactTestRenderer|undefined;
const button=(tree:Renderer.ReactTestRenderer,label:string)=>tree.root.findAll(n=>n.props.accessibilityLabel===label&&typeof n.props.onPress==='function')[0];
afterEach(async()=>{await act(async()=>mounted?.unmount());mounted=undefined;jest.useRealTimers();});
test('configured chat sends text and unconfigured voice is visibly disabled',async()=>{
 AppState.currentState='active';
 const session={state:{account:{id},snapshot:{pet:{id}}},checkChatPending:jest.fn(async()=>{}),acceptChatLife:jest.fn(),chatRead:jest.fn(async()=>({petId:id,turns:[],before:null,chatEnabled:true,speechEnabled:false})),chatWrite:jest.fn(async()=>({id}))} as unknown as Session;
 const platform={newKey:()=> 'a'.repeat(48),cancelRecording:jest.fn(async()=>{})} as unknown as PlatformBridge;
 await act(async()=>{mounted=Renderer.create(<ChatPage session={session} platform={platform} surface="interior"/>);});
 expect(button(mounted!,'语音待配置').props.disabled).toBe(true);
 await act(async()=>mounted!.root.findByType(TextInput).props.onChangeText('过来陪我'));
 await act(async()=>button(mounted!,'发送').props.onPress());
 expect(session.chatWrite).toHaveBeenCalledWith('/me/pet/chat',{text:'过来陪我',surface:'interior'});expect(mounted!.root.findByType(TextInput).props.value).toBe('');
});
test('memory management displays content, origin and correction action',async()=>{
 AppState.currentState='active';
 const session={state:{account:{id},snapshot:{pet:{id}}},checkChatPending:jest.fn(async()=>{}),acceptChatLife:jest.fn(),chatRead:jest.fn(async(path:string)=>path.endsWith('memories')?{items:[{id,text:'主人喜欢苹果',sourceTurnId:id,updatedAt:'2026-10-23T00:00:00Z'}],status:'ready'}:{petId:id,turns:[],before:null,chatEnabled:true,speechEnabled:false}),chatWrite:jest.fn(async()=>({changed:true}))} as unknown as Session;
 const platform={newKey:()=> 'a'.repeat(48),cancelRecording:jest.fn(async()=>{})} as unknown as PlatformBridge;
 await act(async()=>{mounted=Renderer.create(<ChatPage session={session} platform={platform} surface="interior"/>);});
 await act(async()=>button(mounted!,'管理长期记忆').props.onPress());expect(JSON.stringify(mounted!.toJSON())).toContain('主人喜欢苹果');expect(button(mounted!,'查看记忆来源')).toBeDefined();
 await act(async()=>button(mounted!,'修改').props.onPress());await act(async()=>mounted!.root.findByType(TextInput).props.onChangeText('主人喜欢蓝莓'));
 await act(async()=>button(mounted!,'保存记忆').props.onPress());expect(session.chatWrite).toHaveBeenCalledWith(`/me/pet/memories/${id}/update`,{text:'主人喜欢蓝莓'});
});
