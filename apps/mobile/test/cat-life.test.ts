import {memoryCredentials} from './credentials';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Session} from '../src/session/Session';
import {catLife} from '../src/session/wire';
import type {CatLifeView} from '../../../packages/contracts/src/index';
const view = (petId='cat'):CatLifeView=>({petId,revision:1,serverNow:'2026-10-23T00:00:00Z',automatic:true,cushion:'shelter',temperament:{curiosity:.5,sensitivity:.5,sociability:.5},needs:{hunger:.2,fatigue:.3,stimulation:.4,alertness:.1},preferences:{sunny:.5,shelter:.4,food:.3,nearby:.2},intent:{id:'00000000-0000-0000-0000-000000000001',activity:'watch',spot:'sunny',surface:'interior',startedAt:'2026-10-23T00:00:00Z',durationSeconds:45},memories:[],decisionSource:'jev'});
const event={surface:'interior' as const,event:'observe' as const,intentId:null,target:null,automatic:true};
function fixture(){
 const disk=new Map<string,string>(),calls:Array<{key:string;body:any}>=[];
 let user='cat',lost=false,bad=false,count=0,release:(()=>void)|undefined;
 const fetcher:typeof fetch=async(path,init)=>{
  const route=String(path).split('/v1')[1];
  let body:unknown;
  if(route==='/auth/login'){user=JSON.parse(String(init?.body)).email;body={account:{id:user,email:user,username:user},accessToken:'a'.repeat(43),expiresAt:'2026-10-24T00:00:00Z'};}
  else if(route==='/me/snapshot')body={player:{id:user,accountId:user,username:user},pet:{id:user,nickname:'猫',speciesId:'cat',status:'AT_HOME'},revision:1,serverNow:'2026-10-23T00:00:00Z',configVersion:'test',inventory:[],collection:[],activeTrip:null};
  else if(route==='/me/pet/life'){
   const owner=user;calls.push({key:new Headers(init?.headers).get('Idempotency-Key')!,body:JSON.parse(String(init?.body))});
   if(lost){lost=false;throw Error('lost response');}
   if(release)await new Promise<void>(resolve=>{release=resolve;});
   body=bad?{...view(owner),intent:{...view(owner).intent,activity:'execute'}}:view(owner);
  }else body={};
  return new Response(JSON.stringify(body));
 };
 const session=new Session({credentials:memoryCredentials(),baseURL:'https://example.test/v1',development:false,journal:{read:async key=>disk.get(key)??null,write:async(key,value)=>{disk.set(key,value);},remove:async key=>{disk.delete(key);}},key:()=>`cat-life-key-${String(++count).padStart(8,'0')}`,now:()=>0,fetch:fetcher});
 return {session,disk,calls,lose:()=>{lost=true;},malformed:()=>{bad=true;},delay:()=>{release=()=>{};},release:()=>{release?.();release=undefined;}};
}
test('life wire rejects unsupported actions, unbounded memories and invalid numbers',()=>{
 assert.ok(catLife(view()));
 assert.equal(catLife({...view(),intent:{...view().intent,activity:'fly'}}),false);
 assert.equal(catLife({...view(),needs:{...view().needs,hunger:NaN}}),false);
 assert.equal(catLife({...view(),memories:Array(17).fill({})}),false);
});
test('unknown life outcome keeps its receipt and reuses the same key before a later event',async()=>{
 const f=fixture();await f.session.authenticate('cat','password');f.lose();await f.session.advanceLife(event);
 assert.equal(f.disk.size,1);assert.equal(f.session.state.life,null);assert.equal(f.session.state.pending,null);
 await f.session.advanceLife(event);
 assert.equal(f.calls.length,3);assert.equal(f.calls[0].key,f.calls[1].key);assert.notEqual(f.calls[1].key,f.calls[2].key);
 assert.equal(f.calls[2].body.expectedRevision,1);assert.equal(f.session.state.life?.intent?.activity,'watch');assert.equal(f.disk.size,0);
});
test('malformed model-facing view cannot reach Godot or discard a pending receipt',async()=>{
 const f=fixture();await f.session.authenticate('cat','password');f.malformed();await f.session.advanceLife(event);
 assert.equal(f.session.state.life,null);assert.equal(f.disk.size,1);
});
test('switching accounts drops a late life reply and retains the original account receipt',async()=>{
 const f=fixture();await f.session.authenticate('cat','password');f.delay();const pending=f.session.advanceLife(event);
 for(let i=0;i<20&&!f.calls.length;i++)await new Promise<void>(resolve=>setImmediate(resolve));
 assert.equal(f.calls.length,1);await f.session.authenticate('other','password');f.release();await pending;
 assert.equal(f.session.state.account?.id,'other');assert.equal(f.session.state.life,null);assert.equal(f.disk.size,1);
 assert.ok([...f.disk.keys()][0].includes('cat'));
});
