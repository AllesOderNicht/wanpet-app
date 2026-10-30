import {PET_ACTIVITIES, PET_SPOTS} from '../../../../packages/contracts/src/index';
import type {AuthResponse, SessionResponse, PlayerSnapshot, RewardLine, TripView, CatLifeView, CatLifeRequest, PetProfileView, PetProfileRequest, PetCareRequest} from '../../../../packages/contracts/src/index';
export const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = 256): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const integer = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= 2147483647;
const timestamp = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(v) && Number.isFinite(Date.parse(v));
export function lines(v: unknown, collection = false): v is RewardLine[] {
  if (!Array.isArray(v) || v.length > 10000) return false;
  const ids = new Set<string>();
  return v.every(item => {
    if (!record(item) || !text(item.itemId) || !integer(item.quantity) || ids.has(item.itemId) || (collection && !timestamp(item.firstCollectedAt))) return false;
    ids.add(item.itemId); return true;
  });
}
export function trip(v: unknown): v is TripView {
  return record(v) && text(v.id) && typeof v.status==='string' && ['TRAVELING','READY_TO_CLAIM','CLAIMED'].includes(v.status) && timestamp(v.startedAt) && timestamp(v.returnAt) && text(v.configVersion) && text(v.destinationId);
}
export function snapshot(v: unknown): v is PlayerSnapshot {
  return record(v) && record(v.player) && record(v.pet) && text(v.player.id) && text(v.player.accountId) && text(v.player.username)
    && text(v.pet.id) && text(v.pet.speciesId) && text(v.pet.nickname) && typeof v.pet.status==='string' && ['AT_HOME','TRAVELING'].includes(v.pet.status)
    && integer(v.revision, 1) && timestamp(v.serverNow) && text(v.configVersion) && lines(v.inventory) && lines(v.collection ?? [], true)
    && Object.hasOwn(v, 'activeTrip') && (v.activeTrip === null || trip(v.activeTrip));
}
export function auth(v: unknown): v is AuthResponse {
  return session(v) && record(v) && typeof v.accessToken === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v.accessToken);
}
export function session(v: unknown): v is SessionResponse {
  return record(v) && record(v.account) && text(v.account.id) && text(v.account.email,254) && text(v.account.username)
    && (v.expiresAt === null || timestamp(v.expiresAt));
}
export function accepts(current: PlayerSnapshot | null, candidate: unknown): candidate is PlayerSnapshot {
  return snapshot(candidate) && (!current || (candidate.player.id === current.player.id && (candidate.revision > current.revision ||
    (candidate.revision === current.revision && Date.parse(candidate.serverNow) >= Date.parse(current.serverNow)))));
}
export function endpointAllowed(base: string, development: boolean): boolean {
  const match = /^(https?):\/\/([A-Za-z0-9.-]+)(?::([0-9]{1,5}))?\/(?:wanpet-api\/)?v1$/.exec(base);
  if (!match || (match[3] && (Number(match[3]) < 1 || Number(match[3]) > 65535))) return false;
  return match[1] === 'https' || (development && (['localhost','127.0.0.1'].includes(match[2]) || privateIPv4(match[2])) && !!match[3]);
}
const legacyActivities=['sleep','eat','watch','sniff','rest','approach','retreat'];
const legacySpots=['sunny','shelter','food','nearby'];
const unit=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1;
const member=(v:unknown,values:readonly string[]):v is string=>typeof v==='string'&&values.includes(v);
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v);
const traits=(v:unknown)=>record(v)&&['curiosity','sociability','sensitivity'].every(k=>unit(v[k]));
const fields=(v:Record<string,unknown>,required:readonly string[],optional:readonly string[]=[])=>required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k));
const revision=(v:unknown)=>integer(v)&&v<=2147483646;

export function petProfile(v:unknown):v is PetProfileView {
 return record(v)&&text(v.petId)&&integer(v.revision)&&text(v.nickname,24)&&text(v.speciesId)
  &&typeof v.description==='string'&&v.description.length<=500&&member(v.voice,['gentle','playful','quiet'])
  &&traits(v.temperament)&&timestamp(v.updatedAt);
}
export function petProfileRequest(v:unknown):v is PetProfileRequest {
 return record(v)&&fields(v,['expectedRevision','nickname','description','voice','temperament'])&&revision(v.expectedRevision)
  &&typeof v.nickname==='string'&&v.nickname.trim().length>0&&v.nickname.trim().length<=24
  &&typeof v.description==='string'&&v.description.trim().length<=500&&member(v.voice,['gentle','playful','quiet'])
  &&record(v.temperament)&&fields(v.temperament,['curiosity','sociability','sensitivity'])&&traits(v.temperament);
}
export function petCareRequest(v:unknown):v is PetCareRequest {
 return record(v)&&fields(v,['operation','source','expectedRevision'])&&revision(v.expectedRevision)
  &&member(v.operation,['feed','refill_water','clean_toilet'])&&member(v.source,['basic','inventory'])
  &&(v.operation==='feed'||v.source==='basic');
}
export function catRequest(v:unknown):v is CatLifeRequest {
 if(!record(v)||!fields(v,['surface','event','automatic','intentId','expectedRevision','target'],['invitedActivity','protocolVersion'])
  ||!member(v.surface,['interior','courtyard'])||!member(v.event,['observe','started','arrived','complete','blocked','stroke','invite','move_cushion'])
  ||typeof v.automatic!=='boolean'||!revision(v.expectedRevision)||(v.intentId!==null&&!id(v.intentId))
  ||(v.protocolVersion!==undefined&&v.protocolVersion!==2)||(v.event==='arrived'&&v.protocolVersion!==2))return false;
 if(['started','arrived','complete','blocked'].includes(v.event)&&v.intentId===null)return false;
 if(['move_cushion','invite'].includes(v.event)?!member(v.target,['sunny','shelter']):v.target!==null)return false;
 return v.invitedActivity===undefined||(v.event==='invite'&&member(v.invitedActivity,v.protocolVersion===2?PET_ACTIVITIES:legacyActivities));
}
export function catLife(v:unknown):v is CatLifeView {
 if(!record(v)||!text(v.petId)||!integer(v.revision)||!timestamp(v.serverNow)||typeof v.automatic!=='boolean'
  ||!member(v.cushion,['sunny','shelter'])||!member(v.decisionSource,['jev','rules','continuity'])||(v.version!==undefined&&v.version!==2))return false;
 if(!traits(v.temperament)||!record(v.needs)||!['hunger','fatigue','stimulation','alertness'].every(k=>unit((v.needs as Record<string,unknown>)[k]))
  ||!record(v.preferences)||!legacySpots.every(k=>unit((v.preferences as Record<string,unknown>)[k]))
  ||!PET_SPOTS.every(k=>!Object.hasOwn(v.preferences as object,k)||unit((v.preferences as Record<string,unknown>)[k])))return false;
 if(v.intent!==null){
  const i=v.intent;
  if(!record(i)||!id(i.id)||!member(i.activity,PET_ACTIVITIES)||!member(i.spot,PET_SPOTS)||!member(i.surface,['interior','courtyard'])
   ||!timestamp(i.startedAt)||!integer(i.durationSeconds,1)||i.durationSeconds>180)return false;
  if(i.protocolVersion!==undefined&&i.protocolVersion!==2)return false;
  if(i.protocolVersion===2){
   if(!member(i.stage,['moving','using'])||(i.stage==='using'?!timestamp(i.usingAt)||Date.parse(i.usingAt)<Date.parse(i.startedAt):i.usingAt!==undefined))return false;
  }else if(i.stage!==undefined||i.usingAt!==undefined||!legacyActivities.includes(i.activity))return false;
 }
 if(v.body!==undefined&&(!record(v.body)||!['thirst','bowel','cleanliness'].every(k=>unit((v.body as Record<string,unknown>)[k]))))return false;
 if(v.mood!==undefined&&(!record(v.mood)||!member(v.mood.label,['relaxed','curious','happy','sleepy','uneasy'])
  ||!['pleasure','energy','safety'].every(k=>unit((v.mood as Record<string,unknown>)[k]))))return false;
 if(v.facilities!==undefined){
  const f=v.facilities;if(!record(f))return false;
  for(const key of ['food','water']){const b=f[key];if(!record(b)||!integer(b.portions)||b.portions>3||(b.reservedBy!==null&&!id(b.reservedBy)))return false;}
  if(!record(f.toilet)||!unit(f.toilet.cleanliness)||!integer(f.toilet.uses)||!record(f.reading)||!text(f.reading.bookId)||!integer(f.reading.sessions))return false;
 }
 if(v.profile!==undefined&&(!petProfile(v.profile)||v.profile.petId!==v.petId))return false;
 if(v.activities!==undefined){
  if(!Array.isArray(v.activities)||v.activities.length>PET_ACTIVITIES.length)return false;
  const seen=new Set<string>();
  if(!v.activities.every(a=>{
   if(!record(a)||!member(a.id,PET_ACTIVITIES)||seen.has(a.id)||!text(a.label,80)||!member(a.spot,PET_SPOTS)||typeof a.available!=='boolean'||!(a.reason===null||text(a.reason,180)))return false;
   seen.add(a.id);return true;
  }))return false;
 }
 return Array.isArray(v.memories)&&v.memories.length<=16&&v.memories.every(m=>record(m)&&id(m.id)&&timestamp(m.at)
  &&member(m.activity,PET_ACTIVITIES)&&member(m.spot,PET_SPOTS)&&member(m.kind,['observed','away'])&&text(m.text,180));
}

function privateIPv4(host:string):boolean {
 const parts=host.split('.');if(parts.length!==4||parts.some(p=>!/^\d{1,3}$/.test(p)||String(Number(p))!==p||Number(p)>255))return false;
 const [a,b]=parts.map(Number);return a===10||(a===172&&b!>=16&&b!<=31)||(a===192&&b===168);
}
