// Synthetic namespaces only; does not access a player's canonical memories.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Mem0Gateway} from '../apps/server/dist/memory-gateway.js';
import {loadConfig} from '../apps/server/dist/config.js';
assert.ok(/^wanpet_test(?:_[a-z0-9]+)?$/.test(new URL(process.env.MEM0_DATABASE_URL).pathname.slice(1)), 'An isolated mem0 test database is required');
const config=loadConfig({...process.env,PET_CHAT_ENABLED:'true'}),gateway=new Mem0Gateway(config);
const scope=randomUUID()+':0',other=randomUUID()+':0';
try{
 const entries=['主人喜欢甜瓜','主人喜欢安静的午后'].map(text=>({id:randomUUID(),text,sourceTurnId:null}));
 const first=await gateway.rebuild(scope,entries);assert.equal(first.length,2);
 const second=await gateway.rebuild(scope,entries);assert.deepEqual(second.map(x=>x.id).sort(),first.map(x=>x.id).sort());
 await gateway.rebuild(other,[{id:randomUUID(),text:'其他主人喜欢柠檬',sourceTurnId:null}]);
 const found=await gateway.search(scope,'喜欢什么水果');assert.ok(found.some(x=>x.memory.includes('甜瓜')));assert.ok(found.every(x=>!x.memory.includes('柠檬')));
 await gateway.purge(scope);assert.deepEqual(await gateway.search(scope,'甜瓜'),[]);
 console.log('PASS real pgvector/Ark rebuild resume, namespace isolation, search and deletion');
}finally{await gateway.purge(scope);await gateway.purge(other);gateway.close();}
