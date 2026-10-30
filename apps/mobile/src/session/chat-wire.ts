import type {ChatHistory,ChatEvents,ChatTurnView,PetMemories,SpeechJobView} from '../../../../packages/contracts/src/index';
import {PET_ACTIVITIES} from '../../../../packages/contracts/src/index';
import {record,catLife} from './wire';
import {media,job} from './image-wire';
const id=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v);
const text=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max;
const statuses=['queued','running','completed','failed','cancelled'];
const member=(v:unknown,values:readonly string[]):v is string=>typeof v==='string'&&values.includes(v);
export function turn(v:unknown):v is ChatTurnView {
 if(!record(v)||!id(v.id)||!text(v.userText,4000)||!text(v.reply,16000)||!member(v.status,statuses)||!text(v.createdAt,30)||!Number.isFinite(Date.parse(String(v.createdAt)))||!(v.error===null||text(v.error,80))||!member(v.memoryStatus,['pending','ready','unavailable']))return false;
 if(v.invitation!==null){const i=v.invitation;if(!record(i)||!member(i.activity,PET_ACTIVITIES)||!member(i.outcome,['accepted','declined','deferred','unavailable'])||!member(i.stage,['requested','started','completed','blocked'])||!(i.intentId===null||id(i.intentId))||!(i.life===null||catLife(i.life)))return false;}
 if(v.images!==undefined&&(!Array.isArray(v.images)||v.images.length>4||!v.images.every(media)))return false;
 if(v.imageJob!==undefined&&v.imageJob!==null&&!job(v.imageJob))return false;
 return true;
}
export function history(v:unknown):v is ChatHistory {return record(v)&&id(v.petId)&&Array.isArray(v.turns)&&v.turns.length<=30&&v.turns.every(turn)&&(v.before===null||id(v.before))&&typeof v.chatEnabled==='boolean'&&typeof v.speechEnabled==='boolean'&&(v.imageEnabled===undefined||typeof v.imageEnabled==='boolean');}
export function events(v:unknown):v is ChatEvents {return record(v)&&turn(v.turn)&&Number.isSafeInteger(v.cursor)&&Number(v.cursor)>=0&&Array.isArray(v.events)&&v.events.length<=100&&v.events.every(e=>record(e)&&Number.isSafeInteger(e.id)&&member(e.type,['status','text','tool','memory','image'])&&record(e.data));}
export function memories(v:unknown):v is PetMemories {return record(v)&&member(v.status,['ready','pending','unavailable'])&&Array.isArray(v.items)&&v.items.every(m=>record(m)&&id(m.id)&&text(m.text,1000)&&(m.sourceTurnId===null||id(m.sourceTurnId))&&typeof m.updatedAt==='string'&&Number.isFinite(Date.parse(m.updatedAt)));}
export function speech(v:unknown):v is SpeechJobView {return record(v)&&id(v.id)&&member(v.status,statuses)&&text(v.text,4000)&&(v.error===null||text(v.error,80));}
export function replyId(v:unknown):string {if(!record(v)||!id(v.id))throw new Error('INVALID_RESPONSE');return v.id;}
