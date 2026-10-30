import {memoryCredentials} from './credentials';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {CatLifeView, PetProfileRequest, PetProfileView, PlayerSnapshot} from '../../../packages/contracts/src/index';
import {Session} from '../src/session/Session';
import {petProfile, petProfileRequest} from '../src/session/wire';

const baseURL='https://example.test/v1';
const at='2026-10-29T00:00:00.000Z';
const catId='00000000-0000-0000-0000-000000000001';
const otherId='00000000-0000-0000-0000-000000000002';
const temperament={curiosity:.5,sociability:.5,sensitivity:.5};
const draft=(expectedRevision=0):PetProfileRequest=>({expectedRevision,nickname:'小丸',description:'喜欢晒太阳',voice:'gentle',temperament:{...temperament}});
function accountState(username:string) {
 const petId=username==='cat'?catId:otherId;
 const profile:PetProfileView={petId,revision:0,nickname:'小猫',speciesId:'calico',description:'',voice:'quiet',temperament:{...temperament},updatedAt:at};
 const snapshot:PlayerSnapshot={player:{id:`player-${username}`,accountId:username,username},pet:{id:petId,nickname:profile.nickname,speciesId:'calico',status:'AT_HOME'},revision:1,serverNow:at,configVersion:'test',inventory:[{itemId:'test_food',quantity:4}],collection:[],activeTrip:null};
 const life:CatLifeView={petId,revision:1,serverNow:at,temperament:{...temperament},needs:{hunger:.3,fatigue:.3,stimulation:.4,alertness:.1},preferences:{sunny:.5,shelter:.5,food:.5,nearby:.5},cushion:'shelter',automatic:true,intent:null,memories:[],decisionSource:'rules',version:2,profile,body:{thirst:.2,bowel:.1,cleanliness:1},mood:{label:'relaxed',pleasure:.6,energy:.7,safety:.9},facilities:{food:{portions:1,reservedBy:null},water:{portions:1,reservedBy:null},toilet:{cleanliness:.5,uses:1},reading:{bookId:'garden',sessions:0}}};
 return {snapshot,life,profile};
}
type Fault='lost'|'malformed'|'foreign-life'|'foreign-snapshot'|'foreign-profile';
function fixture() {
 const disk=new Map<string,string>(),states=new Map<string,ReturnType<typeof accountState>>(),receipts=new Map<string,unknown>();
 const writes:Array<{owner:string;path:string;key:string|null;body:Record<string,unknown>}>=[];
 let owner='cat',sequence=0,fault:Fault|undefined,failStorage=false;
 let hold:{entered:()=>void;waiting:Promise<void>}|undefined;
 const state=(username=owner)=>{let value=states.get(username);if(!value){value=accountState(username);states.set(username,value);}return value;};
 const journal={read:async(key:string)=>disk.get(key)??null,write:async(key:string,value:string)=>{if(failStorage)throw new Error('STORAGE');disk.set(key,value);},remove:async(key:string)=>{disk.delete(key);}};
 const fetcher:typeof fetch=async(input,init)=>{
  const path=String(input).slice(baseURL.length),method=init?.method??'GET';
  if(path==='/auth/login'){
   owner=JSON.parse(String(init?.body)).email;
   return Response.json({account:{id:owner,email:owner,username:owner},accessToken:'a'.repeat(43),expiresAt:'2026-10-30T00:00:00.000Z'});
  }
  if(path==='/auth/logout')return Response.json({});
  if(path==='/me/snapshot')return Response.json(state().snapshot);
  if(path==='/me/pet/life'&&method==='GET')return Response.json({...state().life,profile:state().profile});
  if(method!=='POST'||!['/me/pet/care','/me/pet/profile'].includes(path))throw new Error(`Unexpected route ${path}`);
  const account=owner,current=state(account),body=JSON.parse(String(init?.body)) as Record<string,unknown>,key=new Headers(init?.headers).get('Idempotency-Key');
  writes.push({owner:account,path,key,body});
  const receiptKey=`${account}:${key}`,nextFault=fault;fault=undefined;
  let reply:unknown=receipts.get(receiptKey);
  if(!reply){
   const expected=path==='/me/pet/care'?current.life.revision:current.profile.revision;
   if(body.expectedRevision!==expected)return Response.json({code:path==='/me/pet/profile'?'PROFILE_CONFLICT':'LIFE_CONFLICT'},{status:409});
   if(path==='/me/pet/care'){
    current.life.revision++;
    if(body.operation==='feed')current.life.facilities!.food.portions++;
    if(body.source==='inventory'){
     current.snapshot.revision++;
     current.snapshot.inventory[0].quantity--;
    }
    reply={life:{...current.life,profile:current.profile},snapshot:current.snapshot};
   }else{
    const request=body as unknown as PetProfileRequest;
    current.profile={...current.profile,nickname:request.nickname,description:request.description,voice:request.voice,temperament:{...request.temperament},revision:current.profile.revision+1};
    current.snapshot={...current.snapshot,revision:current.snapshot.revision+1,pet:{...current.snapshot.pet,nickname:current.profile.nickname}};
    reply=current.profile;
   }
   reply=structuredClone(reply);receipts.set(receiptKey,reply);
  }
  if(hold){const delayed=hold;hold=undefined;delayed.entered();await delayed.waiting;}
  if(nextFault==='lost')throw new Error('lost response after commit');
  if(nextFault==='malformed')return Response.json({life:{revision:2},snapshot:current.snapshot});
  if(nextFault==='foreign-life')reply={...(reply as object),life:{...current.life,petId:otherId,profile:{...current.profile,petId:otherId}}};
  if(nextFault==='foreign-snapshot')reply={...(reply as object),snapshot:{...current.snapshot,pet:{...current.snapshot.pet,id:otherId}}};
  if(nextFault==='foreign-profile')reply={...current.profile,petId:otherId};
  return Response.json(reply);
 };
 const session=new Session({credentials:memoryCredentials(),baseURL,development:false,journal,key:()=>`pet-command-key-${String(++sequence).padStart(8,'0')}`,now:()=>0,fetch:fetcher});
 return {session,disk,writes,state,
  login:async(username='cat')=>{await session.authenticate(username,'password');await session.refreshPet();},
  failNext:(value:Fault)=>{fault=value;},failStorage:()=>{failStorage=true;},
  holdNext:()=>{
   let entered!:()=>void,release!:()=>void;
   const started=new Promise<void>(resolve=>{entered=resolve;}),waiting=new Promise<void>(resolve=>{release=resolve;});
   hold={entered,waiting};return {started,release};
  },
 };
}

test('a committed care command with a lost reply survives login and replays one inventory debit',async()=>{
 const f=fixture();await f.login();f.failNext('lost');
 await assert.rejects(f.session.care('feed','inventory'),/NETWORK/);
 assert.equal(f.state().snapshot.inventory[0].quantity,3);assert.equal(f.session.state.snapshot?.inventory[0].quantity,4);
 assert.equal(f.session.state.petPending,true);assert.equal(f.disk.size,1);
 await f.login();assert.equal(f.session.state.petPending,true);
 await f.session.retryPetCommand();
 assert.equal(f.writes.length,2);assert.equal(f.writes[0].key,f.writes[1].key);assert.deepEqual(f.writes[0].body,f.writes[1].body);
 assert.equal(f.session.state.snapshot?.inventory[0].quantity,3);assert.equal(f.session.state.life?.facilities?.food.portions,2);
 assert.equal(f.disk.size,0);assert.equal(f.session.state.petPending,false);assert.equal(f.session.state.petBusy,false);
});

test('pending care blocks a new profile command until the original receipt is resolved',async()=>{
 const f=fixture();await f.login();f.failNext('lost');await assert.rejects(f.session.care('feed'),/NETWORK/);
 const receipt=[...f.disk.values()][0];
 await assert.rejects(f.session.saveProfile(draft()),/PET_PENDING/);
 assert.equal(f.writes.length,1);assert.equal([...f.disk.values()][0],receipt);
 await f.session.retryPetCommand();await f.session.saveProfile(draft());
 assert.equal(f.session.state.profile?.nickname,'小丸');assert.notEqual(f.writes[2].key,f.writes[0].key);
});

test('malformed and foreign-pet care replies keep the receipt and leave displayed state intact',async()=>{
 for(const fault of ['malformed','foreign-life','foreign-snapshot'] as const){
  const f=fixture();await f.login();const before=structuredClone(f.session.state);f.failNext(fault);
  await assert.rejects(f.session.care('feed','inventory'),/INVALID_RESPONSE/,fault);
  assert.deepEqual(f.session.state.snapshot,before.snapshot);assert.deepEqual(f.session.state.life,before.life);
  assert.equal(f.disk.size,1);assert.equal(f.session.state.petPending,true);
  await f.session.retryPetCommand();assert.equal(f.disk.size,0);assert.equal(f.session.state.snapshot?.pet.id,catId);
 }
});

test('a delayed care result cannot change another account or remove the original account receipt',async()=>{
 const f=fixture();await f.login();const hold=f.holdNext(),pending=f.session.care('feed','inventory');
 const rejected=assert.rejects(pending,/ACCOUNT_CHANGED/);await hold.started;
 await f.login('other');const before=structuredClone(f.session.state);hold.release();await rejected;
 assert.equal(f.session.state.account?.id,'other');assert.deepEqual(f.session.state.snapshot,before.snapshot);assert.deepEqual(f.session.state.life,before.life);
 assert.equal(f.session.state.petPending,false);assert.equal(f.session.state.petBusy,false);assert.equal(f.disk.size,1);
 assert.ok([...f.disk.keys()][0].includes('cat'));
 await f.login('cat');assert.equal(f.session.state.petPending,true);await f.session.retryPetCommand();assert.equal(f.disk.size,0);
});

test('an older valid care receipt clears pending without rolling back newer inventory or life',async()=>{
 const f=fixture();await f.login();const hold=f.holdNext(),pending=f.session.care('feed','inventory');await hold.started;
 f.state().snapshot.revision=5;f.state().snapshot.inventory[0].quantity=1;f.state().life.revision=6;f.state().life.facilities!.food.portions=0;
 await f.session.refresh();await f.session.refreshPet();hold.release();await pending;
 assert.equal(f.session.state.snapshot?.revision,5);assert.equal(f.session.state.snapshot?.inventory[0].quantity,1);
 assert.equal(f.session.state.life?.revision,6);assert.equal(f.session.state.life?.facilities?.food.portions,0);
 assert.equal(f.disk.size,0);assert.equal(f.session.state.petPending,false);
});

test('profile conflicts discard only the rejected command and refresh the authoritative profile',async()=>{
 const f=fixture();await f.login();const request=draft(),original=structuredClone(request);
 f.state().profile={...f.state().profile,revision:2,nickname:'另一台设备起的名字',voice:'playful'};
 f.state().snapshot.pet.nickname=f.state().profile.nickname;f.state().snapshot.revision=3;
 await assert.rejects(f.session.saveProfile(request),/PROFILE_CONFLICT/);
 assert.deepEqual(request,original);assert.equal(f.session.state.profile?.revision,2);assert.equal(f.session.state.profile?.nickname,'另一台设备起的名字');
 assert.equal(f.session.state.snapshot?.pet.nickname,'另一台设备起的名字');assert.equal(f.session.state.petPending,false);assert.equal(f.disk.size,0);
 await f.session.saveProfile(draft(2));assert.equal(f.session.state.profile?.revision,3);assert.equal(f.session.state.profile?.nickname,'小丸');
});

test('foreign profile responses cannot replace the current pet profile or discard a receipt',async()=>{
 const f=fixture();await f.login();const before=structuredClone(f.session.state.profile);f.failNext('foreign-profile');
 await assert.rejects(f.session.saveProfile(draft()),/INVALID_RESPONSE/);
 assert.deepEqual(f.session.state.profile,before);assert.equal(f.disk.size,1);
 await f.session.retryPetCommand();assert.equal(f.session.state.profile?.petId,catId);assert.equal(f.session.state.profile?.nickname,'小丸');assert.equal(f.disk.size,0);
});

test('invalid profile fields and storage failure cannot send a pet write',async()=>{
 const f=fixture();await f.login();
 for(const value of [{...draft(),nickname:'   '},{...draft(),description:'x'.repeat(501)},{...draft(),voice:['gentle']},{...draft(),temperament:{...temperament,sensitivity:NaN}},{...draft(),expectedRevision:-1}]){
  await assert.rejects(f.session.saveProfile(value as PetProfileRequest),/INVALID_INPUT/);
 }
 assert.equal(f.disk.size,0);assert.equal(f.writes.length,0);assert.equal(f.session.state.petBusy,false);
 f.failStorage();await assert.rejects(f.session.care('feed'),/STORAGE/);assert.equal(f.writes.length,0);assert.equal(f.disk.size,0);
 assert.equal(petProfile({...f.state().profile,voice:['quiet']}),false);
 assert.equal(petProfileRequest({...draft(),temperament:{...temperament,extra:true}}),false);
});
