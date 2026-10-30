import {memoryCredentials} from './credentials';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Session} from '../src/session/Session';
import * as wire from '../src/session/chat-wire';
const id='00000000-0000-0000-0000-000000000001';
function fixture(){
 const disk=new Map<string,string>(),calls:Array<{key:string|null;body:unknown}>=[];let owner='cat',lost=false,bad=false,count=0,delayed=false,release=()=>{};
 const session=new Session({credentials:memoryCredentials(),baseURL:'https://example.test/v1',development:false,journal:{read:async k=>disk.get(k)??null,write:async(k,v)=>{disk.set(k,v);},remove:async k=>{disk.delete(k);}},key:()=>`chat-key-${String(++count).padStart(12,'0')}`,now:()=>0,fetch:async(path,init)=>{
  const route=String(path).split('/v1')[1];let value:unknown={};
  if(route==='/auth/login'){owner=JSON.parse(String(init?.body)).email;value={account:{id:owner,email:owner,username:owner},accessToken:'a'.repeat(43),expiresAt:'2026-10-24T00:00:00Z'};}
  else if(route==='/me/snapshot')value={player:{id:owner,accountId:owner,username:owner},pet:{id,nickname:'猫',speciesId:'cat',status:'AT_HOME'},revision:1,serverNow:'2026-10-23T00:00:00Z',configVersion:'test',inventory:[],collection:[],activeTrip:null};
  else if(route==='/me/pet/chat'||route?.startsWith('/me/pet/images/')){
   calls.push({key:new Headers(init?.headers).get('Idempotency-Key'),body:JSON.parse(String(init?.body))});
   if(lost){lost=false;throw Error('lost reply');}
   if(delayed)await new Promise<void>(resolve=>{release=resolve;});value={id:bad?'wrong':id};
  }
  return new Response(JSON.stringify(value));
 }});
 return {session,disk,calls,lose:()=>{lost=true;},bad:()=>{bad=true;},delay:()=>{delayed=true;},release:()=>release()};
}
test('chat receipt survives unknown response and reuses the original key',async()=>{
 const f=fixture();await f.session.authenticate('cat','pw');f.lose();
 await assert.rejects(f.session.chatWrite('/me/pet/chat',{text:'你好',surface:'interior'}));assert.equal(f.session.state.chatPending,true);
 await assert.rejects(f.session.chatWrite('/me/pet/chat',{text:'再来一条',surface:'interior'}),/CHAT_PENDING/);
 await f.session.retryChatWrite();assert.equal(f.calls.length,2);assert.equal(f.calls[0].key,f.calls[1].key);assert.deepEqual(f.calls[0].body,f.calls[1].body);assert.equal(f.disk.size,0);
});
test('image confirmation and regeneration reuse the same durable receipt after disconnection',async()=>{
 const f=fixture();await f.session.authenticate('cat','pw');f.lose();
 await assert.rejects(f.session.chatWrite(`/me/pet/images/${id}/confirm`,{}));
 await f.session.retryChatWrite();assert.equal(f.calls.length,2);assert.equal(f.calls[0].key,f.calls[1].key);assert.deepEqual(f.calls[0].body,f.calls[1].body);
 await f.session.chatWrite(`/me/pet/images/${id}/retry`,{});assert.notEqual(f.calls[2].key,f.calls[1].key);
 assert.throws(()=>f.session.imageSource('../../secrets'));assert.equal(f.session.imageSource(id).headers.Authorization,'Bearer '+'a'.repeat(43));
});
test('malformed successful response retains its durable receipt',async()=>{
 const f=fixture();await f.session.authenticate('cat','pw');f.bad();await assert.rejects(f.session.chatWrite('/me/pet/chat',{text:'你好',surface:'interior'}),/INVALID_RESPONSE/);assert.equal(f.disk.size,1);
});
test('account switch rejects late chat results and preserves only the old owner receipt',async()=>{
 const f=fixture();await f.session.authenticate('cat','pw');f.delay();const pending=f.session.chatWrite('/me/pet/chat',{text:'你好',surface:'interior'});const rejected=assert.rejects(pending,/ACCOUNT_CHANGED/);
 for(let i=0;i<20&&!f.calls.length;i++)await new Promise<void>(resolve=>setImmediate(resolve));
 await f.session.authenticate('other','pw');f.release();await rejected;assert.equal(f.session.state.chatPending,false);assert.ok([...f.disk.keys()][0].includes('cat'));
});
test('chat wire rejects unknown operations and invalid memory contents',()=>{
 assert.equal(wire.turn({id,userText:'a',reply:'b',status:'completed',createdAt:'2026-10-23T00:00:00Z',error:null,invitation:null,memoryStatus:'ready'}),true);
 assert.equal(wire.turn({id,status:'execute'}),false);assert.equal(wire.memories({items:[{id,text:5}],status:'ready'}),false);
 assert.throws(()=>wire.replyId({id:'wrong'}));
});
