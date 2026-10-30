import React from 'react';
import Renderer,{act} from 'react-test-renderer';
import {GameSurface} from '../src/game/GameSurface';
import {startEngine,stopEngine,sendScene,sceneEvents} from '../src/game/engine';
import type {CatLifeView} from '../../../packages/contracts/src/index';

jest.mock('../src/game/engine',()=>({
  startEngine:jest.fn(),stopEngine:jest.fn(async()=>{}),
  pauseEngine:jest.fn(),resumeEngine:jest.fn(),
  sendScene:jest.fn(async()=>true),sceneEvents:jest.fn(async()=>[]),
}));

beforeEach(()=>{
 jest.resetAllMocks();
 (startEngine as jest.Mock).mockResolvedValue(undefined);
 (stopEngine as jest.Mock).mockResolvedValue(undefined);
 (sendScene as jest.Mock).mockResolvedValue(true);
 (sceneEvents as jest.Mock).mockResolvedValue([]);
});
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
function lifeFor(surface:'interior'|'courtyard',revision=1):CatLifeView {
 return {petId:'cat',revision,serverNow:'2026-10-29T00:00:00.000Z',automatic:true,cushion:'shelter',decisionSource:'rules',
  temperament:{curiosity:.5,sociability:.5,sensitivity:.5},needs:{hunger:.2,fatigue:.3,stimulation:.4,alertness:.1},preferences:{sunny:.5,shelter:.5,food:.5,nearby:.5},memories:[],
  intent:{id:'00000000-0000-0000-0000-000000000001',activity:'eat',surface,spot:'food',durationSeconds:35,startedAt:'2026-10-29T00:00:00.000Z',protocolVersion:2,stage:'moving'}};
}

test('a native string rejection produces a useful message and disposes on unmount',async()=>{
  (startEngine as jest.Mock).mockRejectedValueOnce('Unable to open libgodot.framework');
  let tree!:Renderer.ReactTestRenderer;
  await act(async()=>{tree=Renderer.create(<GameSurface resourcePath="/bundle" surface="home" active available automatic reduced={false} onEvent={()=>{}}/>);});
  try{
    const rendered=JSON.stringify(tree.toJSON());
    expect(rendered).toContain('小屋暂时无法打开，请重新启动应用。');
    expect(rendered).not.toContain('undefined');
    expect(rendered).not.toContain('libgodot.framework');
  }finally{await act(async()=>tree.unmount());}
  expect(stopEngine).toHaveBeenCalledTimes(1);
});
test('ready host receives authoritative life after surface setup and relays completed events',async()=>{
 jest.useFakeTimers();
 (startEngine as jest.Mock).mockResolvedValueOnce(undefined);(sendScene as jest.Mock).mockClear();
 const completed={type:'life_request',surface:'interior',event:'complete',intentId:'00000000-0000-0000-0000-000000000001',target:null};
 (sceneEvents as jest.Mock).mockResolvedValueOnce([completed]);
 const onEvent=jest.fn();const life={petId:'cat',revision:1,intent:{id:completed.intentId,activity:'eat',surface:'interior',spot:'food',durationSeconds:35},needs:{},cushion:'shelter'} as CatLifeView;
 let tree!:Renderer.ReactTestRenderer;
 await act(async()=>{tree=Renderer.create(<GameSurface resourcePath="/bundle" surface="interior" active available automatic reduced={false} life={life} onEvent={onEvent}/>);});
 try{
  expect((sendScene as jest.Mock).mock.calls.map(c=>c[0].type)).toEqual(['state','surface','life']);
  expect(sendScene).toHaveBeenLastCalledWith({type:'life',value:life});
  await act(async()=>{jest.advanceTimersByTime(250);});
  expect(onEvent.mock.calls[0][0]).toEqual(completed);
 }finally{await act(async()=>tree.unmount());jest.useRealTimers();}
});

test('a delayed state command cannot restore the old room after a surface change',async()=>{
 const oldState=deferred<boolean>();(sendScene as jest.Mock).mockImplementationOnce(()=>oldState.promise);
 const onEvent=jest.fn(),oldLife=lifeFor('interior'),nextLife=lifeFor('courtyard',2);
 let tree!:Renderer.ReactTestRenderer;
 await act(async()=>{tree=Renderer.create(<GameSurface resourcePath="/bundle" surface="interior" active available automatic reduced={false} life={oldLife} onEvent={onEvent}/>);});
 try{
  expect(sendScene).toHaveBeenCalledTimes(1);
  await act(async()=>{tree.update(<GameSurface resourcePath="/bundle" surface="courtyard" active available automatic reduced={false} life={nextLife} onEvent={onEvent}/>);});
  expect(sendScene).toHaveBeenLastCalledWith({type:'life',value:nextLife});
  const completed=(sendScene as jest.Mock).mock.calls.length;
  await act(async()=>oldState.resolve(true));
  expect(sendScene).toHaveBeenCalledTimes(completed);
  expect(sendScene).not.toHaveBeenCalledWith({type:'surface',value:'interior'});
 }finally{await act(async()=>tree.unmount());}
});

test('a delayed surface command cannot send its old life snapshot after rerender',async()=>{
 const oldSurface=deferred<boolean>();
 (sendScene as jest.Mock).mockResolvedValueOnce(true).mockImplementationOnce(()=>oldSurface.promise);
 const onEvent=jest.fn(),oldLife=lifeFor('interior'),nextLife=lifeFor('courtyard',2);
 let tree!:Renderer.ReactTestRenderer;
 await act(async()=>{tree=Renderer.create(<GameSurface resourcePath="/bundle" surface="interior" active available automatic reduced={false} life={oldLife} onEvent={onEvent}/>);});
 try{
  await act(async()=>{tree.update(<GameSurface resourcePath="/bundle" surface="courtyard" active available automatic reduced={false} life={nextLife} onEvent={onEvent}/>);});
  await act(async()=>oldSurface.resolve(true));
  expect(sendScene).not.toHaveBeenCalledWith({type:'life',value:oldLife});
  expect(sendScene).toHaveBeenLastCalledWith({type:'life',value:nextLife});
 }finally{await act(async()=>tree.unmount());}
});

test('unmount ends a pending sync chain before it can dispatch to another engine owner',async()=>{
 const state=deferred<boolean>();(sendScene as jest.Mock).mockImplementationOnce(()=>state.promise);
 let tree!:Renderer.ReactTestRenderer;
 await act(async()=>{tree=Renderer.create(<GameSurface resourcePath="/bundle" surface="interior" active available automatic reduced={false} life={lifeFor('interior')} onEvent={jest.fn()}/>);});
 await act(async()=>tree.unmount());
 await act(async()=>state.resolve(true));
 expect(stopEngine).toHaveBeenCalledTimes(1);expect(sendScene).toHaveBeenCalledTimes(1);
});

test('events returned after unmount cannot reach the previous account callback',async()=>{
 jest.useFakeTimers();const pendingEvents=deferred<unknown[]>(),onEvent=jest.fn();
 (sceneEvents as jest.Mock).mockImplementationOnce(()=>pendingEvents.promise);
 let tree!:Renderer.ReactTestRenderer;
 await act(async()=>{tree=Renderer.create(<GameSurface resourcePath="/bundle" surface="interior" active available automatic reduced={false} onEvent={onEvent}/>);});
 try{
  await act(async()=>{jest.advanceTimersByTime(250);});
  expect(sceneEvents).toHaveBeenCalledTimes(1);
  await act(async()=>tree.unmount());
  await act(async()=>pendingEvents.resolve([{type:'hint',message:'旧账号的场景'}]));
  await act(async()=>{jest.advanceTimersByTime(1000);});
  expect(onEvent).not.toHaveBeenCalled();expect(sceneEvents).toHaveBeenCalledTimes(1);
 }finally{jest.useRealTimers();}
});

test('a mismatched transient intention is skipped until the requested room receives its own snapshot',async()=>{
 const onEvent=jest.fn(),oldLife=lifeFor('interior'),nextLife=lifeFor('courtyard',2);
 let tree!:Renderer.ReactTestRenderer;
 await act(async()=>{tree=Renderer.create(<GameSurface resourcePath="/bundle" surface="courtyard" active available automatic reduced={false} life={oldLife} onEvent={onEvent}/>);});
 try{
  expect((sendScene as jest.Mock).mock.calls.map(call=>call[0].type)).toEqual(['state','surface']);
  expect(JSON.stringify(tree.toJSON())).not.toContain('小屋暂时无法打开');
  await act(async()=>{tree.update(<GameSurface resourcePath="/bundle" surface="courtyard" active available automatic reduced={false} life={nextLife} onEvent={onEvent}/>);});
  expect(sendScene).toHaveBeenLastCalledWith({type:'life',value:nextLife});
 }finally{await act(async()=>tree.unmount());}
});

test('home uses the interior intention without treating the alias as a mismatch',async()=>{
 const life=lifeFor('interior');let tree!:Renderer.ReactTestRenderer;
 await act(async()=>{tree=Renderer.create(<GameSurface resourcePath="/bundle" surface="home" active available automatic reduced={false} life={life} onEvent={jest.fn()}/>);});
 try{expect(sendScene).toHaveBeenLastCalledWith({type:'life',value:life});}finally{await act(async()=>tree.unmount());}
});

test.each(['state','surface','life'])('a rejected %s command stops sync and exposes a scene error',async rejected=>{
 (sendScene as jest.Mock).mockImplementation(async command=>command.type!==rejected);
 let tree!:Renderer.ReactTestRenderer;
 await act(async()=>{tree=Renderer.create(<GameSurface resourcePath="/bundle" surface="interior" active available automatic reduced={false} life={lifeFor('interior')} onEvent={jest.fn()}/>);});
 try{
  expect(sendScene).toHaveBeenCalledTimes(['state','surface','life'].indexOf(rejected)+1);
  expect(JSON.stringify(tree.toJSON())).toContain('小屋暂时无法打开，请重新启动应用。');
 }finally{await act(async()=>tree.unmount());}
});

test('life refresh does not resume the renderer or reselect the visible room',async()=>{
 const {resumeEngine}=require('../src/game/engine');
 const props={resourcePath:'/bundle',surface:'courtyard' as const,active:true,available:true,automatic:true,reduced:false,onEvent:jest.fn()};
 let tree!:Renderer.ReactTestRenderer;
 await act(async()=>{tree=Renderer.create(<GameSurface {...props} life={lifeFor('courtyard')}/>);});
 (sendScene as jest.Mock).mockClear();resumeEngine.mockClear();
 try{
  await act(async()=>tree.update(<GameSurface {...props} life={lifeFor('courtyard',2)}/>));
  expect(resumeEngine).not.toHaveBeenCalled();
  expect((sendScene as jest.Mock).mock.calls.filter(([command])=>command.type==='surface')).toHaveLength(0);
 }finally{await act(async()=>tree.unmount());}
});

test('returning to the original room supersedes an in-flight switch',async()=>{
 const pending=deferred<boolean>();const props={resourcePath:'/bundle',active:true,available:true,automatic:true,reduced:false,onEvent:jest.fn()};
 let tree!:Renderer.ReactTestRenderer;
 await act(async()=>{tree=Renderer.create(<GameSurface {...props} surface="interior"/>);});
 (sendScene as jest.Mock).mockImplementation(command=>command.type==='surface'&&command.value==='courtyard'?pending.promise:Promise.resolve(true));
 try{
  await act(async()=>tree.update(<GameSurface {...props} surface="courtyard"/>));
  await act(async()=>tree.update(<GameSurface {...props} surface="interior"/>));
  expect(sendScene).toHaveBeenLastCalledWith({type:'surface',value:'interior'});
  await act(async()=>pending.resolve(true));
  expect(sendScene).toHaveBeenLastCalledWith({type:'surface',value:'interior'});
 }finally{await act(async()=>tree.unmount());}
});
