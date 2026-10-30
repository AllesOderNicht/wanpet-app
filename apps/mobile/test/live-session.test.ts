import {memoryCredentials} from './credentials';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {Session,type Journal} from '../src/session/Session';

// Explicit opt-in: creates one disposable account on a local development backend.
const base=process.env.MOBILE_TEST_API;
test('RN session real HTTP trip, durable retry, collection and account lifecycle',{skip:!base,timeout:120000},async()=>{
  assert.match(base!,/^http:\/\/127\.0\.0\.1:\d+\/v1$/);
  const directory=await mkdtemp(join(tmpdir(),'wanpet-mobile-'));
  const file=(key:string)=>join(directory,createHash('sha256').update(key).digest('hex'));
  const journal:Journal={
    async read(key){try{return await readFile(file(key),'utf8');}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}},
    async write(key,value){await writeFile(file(key)+'.tmp',value,{mode:0o600});await rename(file(key)+'.tmp',file(key));},
    async remove(key){await rm(file(key),{force:true});},
  };
  let loseStart=true;
  const transport:typeof fetch=async(input,init)=>{
    const response=await fetch(input,init);
    if(loseStart&&String(input).endsWith('/me/trips')&&init?.method==='POST'&&response.ok){
      loseStart=false;await response.text();throw new Error('simulated lost departure receipt');
    }
    return response;
  };
  const make=()=>new Session({credentials:memoryCredentials(),baseURL:base!,development:true,journal,key:()=>randomBytes(24).toString('hex'),now:()=>performance.now(),fetch:transport});
  const username='rn_'+randomBytes(8).toString('hex');
  const password=randomBytes(24).toString('hex'),nextPassword=randomBytes(24).toString('hex');
  let session=make();
  try{
    assert.equal(await session.authenticate(username+'@example.test',password,true,username),true);
    assert.equal(session.state.error,null);
    const initial=session.state.snapshot!;assert.ok(initial);
    await session.startTrip(['test_food']);
    assert.equal(session.state.error,'NETWORK');assert.ok(session.state.pending);
    assert.notEqual(session.state.pending,'invalid');
    const key=(session.state.pending as {key:string}).key;
    await session.logout();assert.equal(session.state.account,null);
    session=make();
    assert.equal(await session.authenticate(username+'@example.test',password),true);
    assert.equal((session.state.pending as {key:string}).key,key);
    await session.retryPending();assert.equal(session.state.pending,null);
    assert.equal(session.state.snapshot!.inventory.find(i=>i.itemId==='test_food')!.quantity,initial.inventory.find(i=>i.itemId==='test_food')!.quantity-1);
    const deadline=performance.now()+75000;
    while(session.state.snapshot?.activeTrip?.status!=='READY_TO_CLAIM'){
      assert.ok(performance.now()<deadline,'server trip did not become ready');
      await new Promise(resolve=>setTimeout(resolve,2000));await session.refresh();
      assert.equal(session.state.online,true);
    }
    await session.claimTrip();assert.equal(session.state.error,null);
    assert.equal(session.state.snapshot?.activeTrip,null);assert.ok(session.state.rewards.length>0);
    assert.ok(session.state.snapshot!.collection.length>0);
    const collection=structuredClone(session.state.snapshot!.collection);
    await session.changePassword(password,nextPassword);assert.equal(session.state.account,null);
    assert.equal(await session.authenticate(username+'@example.test',nextPassword),true);
    assert.deepEqual(session.state.snapshot!.collection,collection);
    await session.logout();assert.equal(session.state.account,null);
  }finally{
    if(session.state.account)await session.logout();
    await rm(directory,{recursive:true,force:true});
  }
});
