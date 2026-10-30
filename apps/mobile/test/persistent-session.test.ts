import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Session, type Journal} from '../src/session/Session';
import {memoryCredentials} from './credentials';

const endpoint='https://www.alleschen.com/wanpet-api/v1';
function fixture(credentials=memoryCredentials()) {
  const journal=memoryCredentials(),sessions=new Map<string,string>(),calls:Array<{path:string;body:any}>=[];
  let offline=false,foreign=false,blocked:((value:Response)=>void)|undefined,hold=false;
  const account=(id:string)=>({id,email:id+'@example.test',username:'小家'});
  const snapshot=(id:string)=>({player:{id:'player-'+id,accountId:id,username:'小家'},pet:{id:'pet-'+id,nickname:'猫',speciesId:'cat',status:'AT_HOME'},revision:1,serverNow:'2026-10-29T00:00:00Z',configVersion:'test',inventory:[],collection:[],activeTrip:null});
  const fetcher:typeof fetch=async(input,init)=>{
    if(offline)throw new Error('offline');
    const path=String(input).slice(endpoint.length),body=init?.body?JSON.parse(String(init.body)):null;
    calls.push({path,body});
    if(path==='/auth/login'||path==='/auth/register'){
      const id=body.email.split('@')[0],accessToken=(id==='alice'?'a':'b').repeat(43);
      sessions.set(accessToken,id);return Response.json({account:account(id),accessToken,expiresAt:null});
    }
    const token=new Headers(init?.headers).get('Authorization')?.slice(7)??'',id=sessions.get(token);
    if(!id)return Response.json({code:'UNAUTHENTICATED'},{status:401});
    if(path==='/auth/logout'){sessions.delete(token);return new Response(null,{status:204});}
    if(path==='/auth/password'){sessions.clear();return new Response(null,{status:204});}
    if(path==='/auth/session'){
      const reply=Response.json({account:account(foreign?'bob':id),expiresAt:null});
      if(hold)return new Promise<Response>(resolve=>{blocked=resolve;});
      return reply;
    }
    return Response.json(snapshot(foreign?'bob':id));
  };
  const make=(store:Journal=credentials)=>new Session({baseURL:endpoint,development:false,journal,credentials:store,key:()=> 'a'.repeat(48),now:()=>0,fetch:fetcher});
  return {make,credentials,journal,sessions,calls,offline:(value=true)=>{offline=value;},foreign:()=>{foreign=true;},hold:()=>{hold=true;},release:()=>{blocked?.(Response.json({account:account('alice'),expiresAt:null}));}};
}
test('startup without saved credentials ends on login without a network request',async()=>{
  const f=fixture(),session=f.make();assert.equal(session.state.restoring,true);await session.restore();
  assert.equal(session.state.restoring,false);assert.equal(session.state.account,null);assert.equal(f.calls.length,0);
});
test('credentials use only secure storage and a new process restores the same account',async()=>{
  const f=fixture(),first=f.make();await first.authenticate('alice@example.test','secret-123');
  assert.equal(f.credentials.data.size,1);assert.equal(f.journal.data.size,0);
  assert.ok(![...f.credentials.data.values()].join('').includes('secret-123'));
  const second=f.make();await second.restore();
  assert.deepEqual(second.state.account,first.state.account);assert.equal(second.state.snapshot?.player.accountId,'alice');
  assert.equal(f.calls.filter(c=>c.path==='/auth/login').length,1);
});
test('registration sends separate email, display name and password',async()=>{
  const f=fixture();await f.make().authenticate('alice@example.test','secret-123',true,'小家');
  assert.deepEqual(f.calls[0],{path:'/auth/register',body:{email:'alice@example.test',username:'小家',password:'secret-123'}});
});
test('offline startup preserves credentials and retry recovers without another login',async()=>{
  const f=fixture();await f.make().authenticate('alice@example.test','secret-123');f.offline();
  const session=f.make();await session.restore();
  assert.equal(session.state.account,null);assert.equal(session.state.restorePending,true);assert.equal(session.state.error,'NETWORK');assert.equal(f.credentials.data.size,1);
  f.offline(false);await session.restore();assert.equal(session.state.account?.id,'alice');assert.equal(session.state.error,null);
});
test('server revocation clears saved credentials instead of restoring a stale account',async()=>{
  const f=fixture();await f.make().authenticate('alice@example.test','secret-123');f.sessions.clear();
  const session=f.make();await session.restore();assert.equal(session.state.account,null);assert.equal(f.credentials.data.size,0);assert.equal(session.state.restorePending,false);
});
test('logout while offline clears local login but preserves operation journals',async()=>{
  const f=fixture(),session=f.make();await session.authenticate('alice@example.test','secret-123');
  await f.journal.write('pending','original-key');f.offline();await session.logout();
  assert.equal(f.credentials.data.size,0);assert.equal(f.journal.data.get('pending'),'original-key');
  const next=f.make();await next.restore();assert.equal(next.state.account,null);assert.equal(next.state.restorePending,false);
});
test('password change clears the saved session and revokes every server session',async()=>{
  const f=fixture(),session=f.make();await session.authenticate('alice@example.test','secret-123');
  await session.changePassword('secret-123','new-secret-123');assert.equal(f.credentials.data.size,0);assert.equal(f.sessions.size,0);assert.equal(session.state.account,null);
});
test('same display name cannot authorize another account snapshot or restored session',async()=>{
  const f=fixture(),first=f.make();await first.authenticate('alice@example.test','secret-123');f.foreign();
  const second=f.make();await second.restore();assert.equal(second.state.account,null);assert.equal(second.state.error,'INVALID_RESPONSE');
  await first.refresh();assert.equal(first.state.snapshot?.player.accountId,'alice');assert.equal(first.state.error,'INVALID_RESPONSE');
});
test('failure to save credentials cannot publish a logged-in account',async()=>{
  const f=fixture(),store=memoryCredentials();store.write=async()=>{throw Error('disk');};
  const session=f.make(store);assert.equal(await session.authenticate('alice@example.test','secret-123'),false);
  assert.equal(session.state.account,null);assert.equal(session.state.error,'CREDENTIAL_STORAGE');assert.equal(f.sessions.size,0);
});
test('unreadable or corrupted credentials do not trigger network requests',async()=>{
  const f=fixture();f.credentials.data.set('session-v1:'+endpoint,'{bad');const session=f.make();await session.restore();
  assert.equal(session.state.account,null);assert.equal(session.state.error,'CREDENTIAL_STORAGE');assert.equal(f.calls.length,0);
});
test('a delayed restore response cannot undo logout or repopulate credentials',async()=>{
  const f=fixture();await f.make().authenticate('alice@example.test','secret-123');f.hold();
  const session=f.make(),pending=session.restore();while(!f.calls.some(c=>c.path==='/auth/session'))await new Promise(resolve=>setTimeout(resolve,0));
  await session.logout();f.release();await pending;assert.equal(session.state.account,null);assert.equal(f.credentials.data.size,0);
});
test('endpoint namespaces cannot restore credentials belonging to another backend',async()=>{
  const f=fixture();f.credentials.data.set('session-v1:https://other.example/v1','ignored');await f.make().restore();
  assert.equal(f.calls.length,0);assert.equal(f.credentials.data.size,1);
});
