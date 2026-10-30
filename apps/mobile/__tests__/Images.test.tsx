import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {AppState,TextInput} from 'react-native';
import {launchCamera,launchImageLibrary} from 'react-native-image-picker';
import {ChatPage} from '../src/screens/ChatPage';
import {ImageBudget,ImageTask,PostcardPictures} from '../src/screens/Images';
import type {Session} from '../src/session/Session';
import type {PlatformBridge} from '../src/session/platform';
const id='00000000-0000-0000-0000-000000000001',imageId='00000000-0000-0000-0000-000000000002';
const image={id:imageId,width:320,height:200,kind:'upload' as const};
let mounted:Renderer.ReactTestRenderer|undefined;
const button=(label:string)=>mounted!.root.findAll(n=>n.props.accessibilityLabel===label&&typeof n.props.onPress==='function')[0];
function fixture(){let key=0;return {
 session:{state:{account:{id},snapshot:{pet:{id}}},checkChatPending:jest.fn(async()=>{}),acceptChatLife:jest.fn(),chatRead:jest.fn(async()=>({petId:id,turns:[],before:null,chatEnabled:true,speechEnabled:false,imageEnabled:true})),chatWrite:jest.fn(async()=>({id})),imageUpload:jest.fn(async()=>image),discardImage:jest.fn(async()=>({id:imageId})),imageSource:()=>({uri:'https://example.test/image'})} as unknown as Session,
 platform:{newKey:()=>String(++key).padStart(48,'a'),cancelRecording:jest.fn(async()=>{})} as unknown as PlatformBridge};}
beforeEach(()=>{AppState.currentState='active';jest.clearAllMocks();});
afterEach(async()=>{await act(async()=>mounted?.unmount());mounted=undefined;jest.useRealTimers();});
test('uploading a photo alone does not send a message or request generation',async()=>{
 const f=fixture();(launchImageLibrary as jest.Mock).mockResolvedValueOnce({assets:[{uri:'file:///test.jpg',base64:'AAAA',fileSize:3}]});
 await act(async()=>{mounted=Renderer.create(<ChatPage {...f} surface="interior"/>);});
 await act(async()=>button('选图片').props.onPress());
 expect(f.session.imageUpload).toHaveBeenCalledTimes(1);expect(f.session.chatWrite).not.toHaveBeenCalled();
 expect(button('发送').props.disabled).toBe(false);
 await act(async()=>button('发送').props.onPress());
 expect(f.session.chatWrite).toHaveBeenCalledWith('/me/pet/chat',{text:'',surface:'interior',imageIds:[imageId]});
 expect(button('移除图片')).toBeUndefined();
});
test('an uncertain upload retries with the same idempotency key; explicit drawing marks the request',async()=>{
 const f=fixture();(launchImageLibrary as jest.Mock).mockResolvedValueOnce({assets:[{uri:'file:///test.jpg',base64:'AAAA',fileSize:3}]});
 (f.session.imageUpload as jest.Mock).mockRejectedValueOnce(Error('NETWORK'));
 await act(async()=>{mounted=Renderer.create(<ChatPage {...f} surface="interior"/>);});
 await act(async()=>button('选图片').props.onPress());expect(button('发送').props.disabled).toBe(true);
 await act(async()=>button('重试上传').props.onPress());
 const calls=(f.session.imageUpload as jest.Mock).mock.calls;expect(calls[0][1]).toBe(calls[1][1]);
 await act(async()=>button('画一张').props.onPress());
 await act(async()=>mounted!.root.findByType(TextInput).props.onChangeText('把照片画成水彩'));
 await act(async()=>button('发送绘图请求').props.onPress());
 expect(f.session.chatWrite).toHaveBeenCalledWith('/me/pet/chat',{text:'把照片画成水彩',surface:'interior',imageIds:[imageId],imageIntent:true});
});
test('camera refusal leaves normal text chat usable',async()=>{
 const f=fixture();(launchCamera as jest.Mock).mockResolvedValueOnce({errorCode:'permission'});
 await act(async()=>{mounted=Renderer.create(<ChatPage {...f} surface="interior"/>);});
 await act(async()=>button('拍照片').props.onPress());
 expect(JSON.stringify(mounted!.toJSON())).toContain('也可以继续文字聊天');
 await act(async()=>mounted!.root.findByType(TextInput).props.onChangeText('你好'));
 await act(async()=>button('发送').props.onPress());expect(f.session.chatWrite).toHaveBeenCalledWith('/me/pet/chat',{text:'你好',surface:'interior'});
});
test('a proposed image waits for confirmation and uncertain outcomes explain paid retry',async()=>{
 const f=fixture(),write=jest.fn(),job={id,origin:'proposal' as const,status:'proposed' as const,prompt:'海边的猫',referenceIds:[imageId],image:null,error:null,attempt:1};
 await act(async()=>{mounted=Renderer.create(<ImageTask session={f.session} job={job} busy={false} write={write}/>);});expect(write).not.toHaveBeenCalled();
 expect(JSON.stringify(mounted!.toJSON())).toContain('将使用这些参考图片');expect(button('查看图片')).toBeDefined();
 await act(async()=>button('好呀，画一张').props.onPress());expect(write).toHaveBeenCalledWith(`/me/pet/images/${id}/confirm`);
 await act(async()=>mounted!.update(<ImageTask session={f.session} job={{...job,status:'unknown',error:'IMAGE_RESULT_UNKNOWN'}} busy={false} write={write}/>));
 expect(JSON.stringify(mounted!.toJSON())).toContain('再次生成可能再次计费');expect(button('重新生成图片')).toBeDefined();
});
test('a collected postcard updates its image independently of reward claims',async()=>{
 jest.useFakeTimers();const f=fixture();let ready=false;
 (f.session.chatRead as jest.Mock).mockImplementation(async()=>({items:[{tripId:id,destinationId:'test_forest',theme:'test_postcard_forest',createdAt:'2026-10-23T00:00:00Z',claimed:true,job:{id,origin:'postcard',status:ready?'completed':'submitted',prompt:'风景',image:ready?{...image,kind:'postcard'}:null,error:null,attempt:1}}],before:null}));
 await act(async()=>{mounted=Renderer.create(<PostcardPictures session={f.session}/>);});
 expect(JSON.stringify(mounted!.toJSON())).toContain('旅行奖励已领取');ready=true;
 await act(async()=>{jest.advanceTimersByTime(1000);});
 expect(button('查看图片')).toBeDefined();expect(f.session.chatWrite).not.toHaveBeenCalled();
});
test('drawing shows remaining shared budget and its reset time without starting a job',async()=>{
 jest.useFakeTimers();const f=fixture();let usedFen=36;
 (f.session.chatRead as jest.Mock).mockImplementation(async()=>({enabled:true,limitFen:1000,usedFen,resetsAt:'2026-10-27T00:00:00Z'}));
 await act(async()=>{mounted=Renderer.create(<ImageBudget session={f.session}/>);});
 expect(JSON.stringify(mounted!.toJSON())).toContain('9.64');expect(JSON.stringify(mounted!.toJSON())).toContain('重置');
 usedFen=1000;await act(async()=>{jest.advanceTimersByTime(30000);});
 expect(JSON.stringify(mounted!.toJSON())).toContain('0.00');expect(f.session.chatWrite).not.toHaveBeenCalled();
});
test('confirming an earlier proposal keeps polling it after it leaves the latest history page',async()=>{
 jest.useFakeTimers();const f=fixture();let status='proposed';
 const earlier=()=>({id,userText:'聊聊森林',reply:'想画一张吗',status:'completed',createdAt:'2026-10-23T00:00:00Z',error:null,memoryStatus:'ready',invitation:null,imageJob:{id,origin:'proposal',status,prompt:'森林里的猫',image:status==='completed'?image:null,error:null,attempt:1}});
 const latest={id:imageId,userText:'你好',reply:'你好呀',status:'completed',createdAt:'2026-10-24T00:00:00Z',error:null,memoryStatus:'ready',invitation:null};
 (f.session.chatRead as jest.Mock).mockImplementation(async(path:string)=>path.includes('/events')?{turn:earlier(),events:[],cursor:0}:{petId:id,turns:path.includes('?before=')?[earlier()]:[latest],before:path.includes('?before=')?null:imageId,chatEnabled:true,speechEnabled:false,imageEnabled:true});
 (f.session.chatWrite as jest.Mock).mockImplementation(async()=>{status='queued';return {id};});
 await act(async()=>{mounted=Renderer.create(<ChatPage {...f} surface="interior"/>);});
 await act(async()=>button('查看更早的消息').props.onPress());
 await act(async()=>button('好呀，画一张').props.onPress());
 expect(JSON.stringify(mounted!.toJSON())).toContain('图片已排队');
 status='completed';await act(async()=>{jest.advanceTimersByTime(1000);});await act(async()=>{jest.advanceTimersByTime(1000);});
 expect(button('查看图片')).toBeDefined();expect(button('好呀，画一张')).toBeUndefined();
 expect(f.session.chatWrite).toHaveBeenCalledTimes(1);
});
test('return postcard uses the claimed trip even when a newer postcard shares its theme',async()=>{
 const f=fixture(),otherImage='00000000-0000-0000-0000-000000000003';
 const postcard=(tripId:string,assetId:string)=>({tripId,destinationId:'test_forest',theme:'test_postcard_forest',createdAt:'2026-10-26T00:00:00Z',claimed:true,job:{id:tripId,origin:'postcard',status:'completed',prompt:'森林',image:{...image,id:assetId,kind:'postcard'},error:null,attempt:1}});
 (f.session.chatRead as jest.Mock).mockResolvedValue({items:[postcard(imageId,otherImage),postcard(id,imageId)],before:null});
 f.session.imageSource=jest.fn(()=>({uri:'https://example.test/image',headers:{Authorization:'Bearer synthetic'},cache:'reload' as const}));
 await act(async()=>{mounted=Renderer.create(<PostcardPictures session={f.session} theme="test_postcard_forest" tripId={id} latest/>);});
 expect(f.session.imageSource).toHaveBeenCalledWith(imageId);expect(f.session.imageSource).not.toHaveBeenCalledWith(otherImage);
});
