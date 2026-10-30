import {memoryCredentials} from './credentials';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Session, type Journal} from '../src/session/Session';
import * as wire from '../src/session/wire';
const base = () => ({player:{id:'player-1',accountId:'account-1',username:'cat'},configVersion:'v1',pet:{id:'pet-1',nickname:'小猫',speciesId:'cat',status:'AT_HOME'},inventory:[{itemId:'test_food',quantity:3}],collection:[],revision:1,serverNow:'2026-10-20T00:00:00Z',activeTrip:null});
const active = {id:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',status:'TRAVELING',startedAt:'2026-10-20T00:00:00Z',returnAt:'2026-10-20T00:01:00Z',configVersion:'v1',destinationId:'forest'};
function fixture() {
  const disk = new Map<string,string>(); const calls: {path:string;method:string;key:string|null;body:any}[] = [];
  let foreign = false; let invalidKey = false; let current: any = base(); let failRead = false; let failWrite = false; let failStart = 0; let starts = 0; let malformed = false; let now = 100;
  const journal: Journal = {read:async k => disk.get(k) ?? null,write:async(k,v)=>{if(failWrite)throw Error();disk.set(k,v);},remove:async k=>{disk.delete(k);}};
  const fetcher: typeof fetch = async (input, init) => {
    const path = String(input).replace('https://example.test/v1','');
    if(path==='/me/snapshot'&&failRead){failRead=false;throw Error('offline');}
    const method=init?.method??'GET'; const headers=new Headers(init?.headers);
    calls.push({path,method,key:headers.get('Idempotency-Key'),body:init?.body?JSON.parse(String(init.body)):null});
    let body: unknown = current;
    if(path==='/auth/login') body={account:{id:'account-1',email:'cat@example.test',username:'cat'},accessToken:'a'.repeat(43),expiresAt:'2026-10-21T00:00:00Z'};
    if(path==='/me/trips') {
      starts++;
      if(failStart-->0)throw Error('lost response');
      current={...base(),revision:2,pet:{...base().pet,status:'TRAVELING'},activeTrip:active};
      body=foreign?{snapshot:{...current,player:{id:'other-player',accountId:'other-account',username:'cat'}},trip:active}:malformed?{snapshot:{}}:{snapshot:current,trip:active};
    }
    return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
  };
  const session=new Session({credentials:memoryCredentials(),baseURL:'https://example.test/v1',development:false,journal,key:()=> invalidKey ? '' : 'idempotency-key-00001',now:()=>now,fetch:fetcher});
  return {session,disk,calls,foreignReceipt:()=>{foreign=true;},loseRead:()=>{failRead=true;},invalidKey:()=>{invalidKey=true;},setCurrent:(v:unknown)=>{current=v;},failStorage:()=>{failWrite=true;},loseStart:()=>{failStart=1;},malformed:()=>{malformed=true;},advance:(ms:number)=>{now+=ms;},starts:()=>starts};
}
test('release accepts HTTPS only; rejects credentials, query and insecure destinations',()=>{
  assert.equal(wire.endpointAllowed('https://api.example/v1',false),true);
  for(const url of ['http://api.example/v1','https://user:pass@api.example/v1','https://api.example/v1?token=x','http://127.0.0.1:3100/v1'])assert.equal(wire.endpointAllowed(url,false),false);
  assert.equal(wire.endpointAllowed('http://127.0.0.1:3100/v1',true),true);
});
test('runtime snapshot rejects duplicate inventory, fractional quantities and missing trip field',()=>{
  assert.ok(wire.snapshot(base()));
  assert.equal(wire.snapshot({...base(),inventory:[{itemId:'x',quantity:1},{itemId:'x',quantity:2}]}),false);
  assert.equal(wire.snapshot({...base(),inventory:[{itemId:'x',quantity:0.5}]}),false);
  const s:any=base();delete s.activeTrip;assert.equal(wire.snapshot(s),false);
});
test('older response cannot replace a newer revision or server clock',()=>{
  assert.equal(wire.accepts({...base(),revision:3} as any,base()),false);
  assert.equal(wire.accepts(base() as any,{...base(),serverNow:'2026-10-19T23:59:59Z'}),false);
  assert.equal(wire.accepts(base() as any,{...base(),player:{id:'other',accountId:'other-account',username:'cat'}}),false);
});
test('login restores the snapshot without storing credentials in operation journals',async()=>{
  const f=fixture();assert.equal(await f.session.authenticate('cat','password'),true);
  assert.equal(f.session.state.snapshot?.revision,1);assert.equal(f.disk.size,0);
});
test('storage failure prevents sending a mutating request',async()=>{
  const f=fixture();await f.session.authenticate('cat','password');f.failStorage();await f.session.startTrip(['test_food']);
  assert.equal(f.starts(),0);assert.equal(f.session.state.error,'STORAGE');assert.equal(f.session.state.busy,false);
});
test('unknown write outcome survives reauthentication and retries the same key',async()=>{
  const f=fixture();await f.session.authenticate('cat','password');f.loseStart();await f.session.startTrip(['test_food']);
  assert.equal(f.disk.size,1);assert.ok(f.session.state.pending);assert.equal(f.session.state.error,'NETWORK');
  await f.session.logout();await f.session.authenticate('cat','password');assert.ok(f.session.state.pending);
  await f.session.retryPending();
  const starts=f.calls.filter(c=>c.path==='/me/trips');assert.equal(starts.length,2);assert.equal(starts[0].key,starts[1].key);assert.deepEqual(starts[0].body,starts[1].body);
  assert.equal(f.disk.size,0);assert.equal(f.session.state.snapshot?.revision,2);
});
test('successful reconnection clears a read outage without leaving a stale error banner',async()=>{
  const f=fixture();await f.session.authenticate('cat','password');
  f.loseRead();await f.session.refresh();
  assert.equal(f.session.state.online,false);assert.equal(f.session.state.error,'NETWORK');
  await f.session.refresh();
  assert.equal(f.session.state.online,true);assert.equal(f.session.state.error,null);
});
test('malformed successful write response retains receipt for safe retry',async()=>{
  const f=fixture();await f.session.authenticate('cat','password');f.malformed();await f.session.startTrip(['test_food']);
  assert.equal(f.session.state.error,'INVALID_RESPONSE');assert.equal(f.disk.size,1);
});
test('corrupt stored receipt blocks writes',async()=>{
  const f=fixture();f.disk.set(JSON.stringify(['https://example.test/v1','account-1']),'{bad');await f.session.authenticate('cat','password');
  assert.equal(f.session.state.pending,'invalid');await f.session.startTrip(['test_food']);assert.equal(f.starts(),0);
});
test('countdown uses server interval and monotonic elapsed time; never marks trip ready locally',async()=>{
  const f=fixture();f.setCurrent({...base(),activeTrip:active,pet:{...base().pet,status:'TRAVELING'}});await f.session.authenticate('cat','password');
  assert.equal(f.session.secondsRemaining(),60);f.advance(25000);assert.equal(f.session.secondsRemaining(),35);f.advance(90000);assert.equal(f.session.secondsRemaining(),0);
  assert.equal(f.session.state.snapshot?.activeTrip?.status,'TRAVELING');
});

test('random-key failure blocks a write before persistence or network',async()=>{
 const f=fixture();await f.session.authenticate('cat','password');f.invalidKey();await f.session.startTrip(['test_food']);
 assert.equal(f.starts(),0);assert.equal(f.disk.size,0);assert.equal(f.session.state.busy,false);assert.equal(f.session.state.error,'STORAGE');
});

test('a different player write receipt cannot discard the pending operation',async()=>{
 const f=fixture();await f.session.authenticate('cat','password');f.foreignReceipt();
 await f.session.startTrip(['test_food']);
 assert.equal(f.session.state.error,'INVALID_RESPONSE');assert.equal(f.disk.size,1);
 assert.ok(f.session.state.pending);assert.equal(f.session.state.snapshot?.player.id,'player-1');
});
test('the initial snapshot must belong to the authenticated account ID',async()=>{
 const f=fixture();f.setCurrent({...base(),player:{id:'other-player',accountId:'other-account',username:'other'}});
 await f.session.authenticate('cat','password');
 assert.equal(f.session.state.snapshot,null);assert.equal(f.session.state.error,'INVALID_RESPONSE');
});

test('phone preview permits private IPv4 only in development', () => {
  for (const host of ['10.43.205.56','172.16.0.1','172.31.255.254','192.168.1.2']) {
    assert.equal(wire.endpointAllowed(`http://${host}:3101/v1`,true),true);
    assert.equal(wire.endpointAllowed(`http://${host}:3101/v1`,false),false);
  }
  for (const host of ['172.15.0.1','172.32.0.1','8.8.8.8','10.999.1.1','010.1.1.1'])assert.equal(wire.endpointAllowed(`http://${host}:3101/v1`,true),false);
});
