import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {TextInput} from 'react-native';
import type {CatLifeView,PetProfileView} from '../../../packages/contracts/src/index';
import {CatLifePage} from '../src/screens/CatLifePage';
import {PetProfilePage} from '../src/screens/PetProfilePage';

const id='00000000-0000-0000-0000-000000000001';
const profile:PetProfileView={petId:id,revision:7,nickname:'小丸',speciesId:'calico',description:'爱晒太阳',voice:'gentle',temperament:{curiosity:.37,sociability:.5,sensitivity:.7},updatedAt:'2026-10-29T00:00:00Z'};
const life:CatLifeView={petId:id,revision:8,serverNow:profile.updatedAt,temperament:profile.temperament,needs:{hunger:.3,fatigue:.2,stimulation:.5,alertness:.1},preferences:{sunny:.5,shelter:.5,food:.5,nearby:.5},cushion:'shelter',automatic:true,intent:null,memories:[],decisionSource:'rules',version:2,body:{thirst:.4,bowel:.3,cleanliness:.8},mood:{label:'relaxed',pleasure:.8,energy:.9,safety:.9},facilities:{food:{portions:1,reservedBy:null},water:{portions:2,reservedBy:null},toilet:{cleanliness:.5,uses:2},reading:{bookId:'book',sessions:1}},profile,activities:[{id:'read',label:'看绘本',spot:'reading',available:true,reason:null},{id:'toilet',label:'上厕所',spot:'toilet',available:true,reason:null}]};
const mounted:Renderer.ReactTestRenderer[]=[];
async function render(node:React.ReactElement){let tree!:Renderer.ReactTestRenderer;await act(async()=>{tree=Renderer.create(node);});mounted.push(tree);return tree;}
const button=(tree:Renderer.ReactTestRenderer,label:string)=>tree.root.findAll(n=>n.props.accessibilityLabel===label&&typeof n.props.onPress==='function')[0];
const field=(tree:Renderer.ReactTestRenderer,label:string)=>tree.root.findAllByType(TextInput).find(n=>n.props.accessibilityLabel===label)!;
afterEach(async()=>{await act(async()=>mounted.splice(0).forEach(tree=>tree.unmount()));});

test('care dispatches distinct sources and available activities without inventing new stock',async()=>{
 const onCare=jest.fn(),onInvite=jest.fn();const tree=await render(<CatLifePage life={life} close={()=>{}} onCushion={()=>{}} onCare={onCare} onInvite={onInvite}/>);
 for(const label of ['添一份基础口粮','用一份背包食物','添满清水','清理猫砂盆','邀请它看绘本','邀请它上厕所'])await act(async()=>button(tree,label).props.onPress());
 expect(onCare.mock.calls).toEqual([['feed','basic'],['feed','inventory'],['refill_water','basic'],['clean_toilet','basic']]);
 expect(onInvite.mock.calls).toEqual([['read'],['toilet']]);expect(JSON.stringify(tree.toJSON())).toContain('食盆里还有 1 份');
});
test('full bowls, occupied toilet, unavailable activities, busy state and missing records disable their controls',async()=>{
 const full:CatLifeView={...life,intent:{id,activity:'toilet',spot:'toilet',surface:'interior',startedAt:profile.updatedAt,durationSeconds:30},facilities:{...life.facilities!,food:{portions:3,reservedBy:null},water:{portions:3,reservedBy:null}},activities:[{id:'read',label:'看绘本',spot:'reading',available:false,reason:'先安静休息一会儿'}]};
 const props={close:()=>{},onCushion:()=>{},onCare:jest.fn(),onInvite:jest.fn()};const tree=await render(<CatLifePage {...props} life={full}/>);
 for(const label of ['添一份基础口粮','用一份背包食物','添满清水','清理猫砂盆','邀请它看绘本'])expect(button(tree,label).props.disabled).toBe(true);
 expect(JSON.stringify(tree.toJSON())).toContain('先安静休息一会儿');
 await act(async()=>tree.update(<CatLifePage {...props} life={life} busy/>));expect(button(tree,'邀请它看绘本').props.disabled).toBe(true);expect(button(tree,'把软垫放到亮处').props.disabled).toBe(true);
 const legacy={...life,body:undefined,facilities:undefined,activities:undefined};await act(async()=>tree.update(<CatLifePage {...props} life={legacy}/>));
 expect(button(tree,'添一份基础口粮').props.disabled).toBe(true);expect(JSON.stringify(tree.toJSON())).toContain('食盆的份数还没更新');expect(JSON.stringify(tree.toJSON())).not.toContain('食盆里还有 0 份');
});
test('failed profile save retains the draft and original revision without a success message',async()=>{
 const onSave=jest.fn(async()=>{throw new Error('网络暂时没接上');});const tree=await render(<PetProfilePage profile={profile} busy={false} onSave={onSave} close={()=>{}}/>);
 await act(async()=>field(tree,'宠物昵称').props.onChangeText('小团'));await act(async()=>button(tree,'保存小伙伴资料').props.onPress());
 expect(onSave).toHaveBeenCalledWith(expect.objectContaining({expectedRevision:7,nickname:'小团',temperament:profile.temperament}));
 expect(field(tree,'宠物昵称').props.value).toBe('小团');expect(JSON.stringify(tree.toJSON())).toContain('网络暂时没接上');expect(JSON.stringify(tree.toJSON())).not.toContain('资料已保存');expect(button(tree,'保存小伙伴资料').props.disabled).toBe(false);
});
test('newer profile data preserves a dirty draft and explicit reload adopts the new revision',async()=>{
 const props={busy:false,onSave:jest.fn(async()=>{}),close:()=>{}};const tree=await render(<PetProfilePage {...props} profile={profile}/>);await act(async()=>field(tree,'宠物昵称').props.onChangeText('未保存的名字'));
 const latest={...profile,revision:8,nickname:'别处的新名字',description:'新的介绍'};await act(async()=>tree.update(<PetProfilePage {...props} profile={latest}/>));
 expect(field(tree,'宠物昵称').props.value).toBe('未保存的名字');expect(button(tree,'保存小伙伴资料').props.disabled).toBe(true);
 await act(async()=>button(tree,'保存小伙伴资料').props.onPress());expect(props.onSave).not.toHaveBeenCalled();
 await act(async()=>button(tree,'舍弃草稿，载入最新资料').props.onPress());expect(field(tree,'宠物昵称').props.value).toBe('别处的新名字');expect(field(tree,'宠物描述').props.value).toBe('新的介绍');
 await act(async()=>field(tree,'宠物描述').props.onChangeText('再添一句'));await act(async()=>button(tree,'保存小伙伴资料').props.onPress());
 expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({expectedRevision:8,description:'再添一句'}));
});
test('voice and trait edits save only once and report success only after the promise resolves',async()=>{
 let resolve!:()=>void;const onSave=jest.fn(()=>new Promise<void>(done=>{resolve=done;}));const props={busy:false,onSave,close:()=>{}};const tree=await render(<PetProfilePage {...props} profile={profile}/>);
 await act(async()=>field(tree,'宠物昵称').props.onChangeText('小团'));await act(async()=>button(tree,'安静').props.onPress());await act(async()=>button(tree,'好奇心高').props.onPress());
 await act(async()=>button(tree,'保存小伙伴资料').props.onPress());expect(JSON.stringify(tree.toJSON())).not.toContain('资料已保存');expect(button(tree,'正在保存…').props.disabled).toBe(true);
 await act(async()=>button(tree,'正在保存…').props.onPress());expect(onSave).toHaveBeenCalledTimes(1);
 expect(onSave).toHaveBeenCalledWith(expect.objectContaining({expectedRevision:7,voice:'quiet',temperament:{...profile.temperament,curiosity:.8}}));
 await act(async()=>resolve());expect(JSON.stringify(tree.toJSON())).toContain('资料已保存');expect(field(tree,'宠物昵称').props.editable).toBe(false);
 await act(async()=>tree.update(<PetProfilePage {...props} profile={{...profile,revision:8,nickname:'小团',voice:'quiet',temperament:{...profile.temperament,curiosity:.8}}}/>));
 expect(field(tree,'宠物昵称').props.value).toBe('小团');expect(field(tree,'宠物昵称').props.editable).toBe(true);expect(button(tree,'保存小伙伴资料').props.disabled).toBe(true);
});
