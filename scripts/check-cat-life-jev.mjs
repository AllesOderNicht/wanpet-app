import assert from 'node:assert/strict';
import {loadConfig} from '../apps/server/dist/config.js';
import {initialCat,catOptions} from '../apps/server/dist/cat-life.js';
import {JevDecisions} from '../apps/server/dist/jev.js';
// Synthetic state only. Run with Node 24 --env-file=.env after build:backend.
const config=loadConfig(process.env);
assert(config.jev,'TOKEN_HUB_API_KEY is required for a live Jev check');
const client=new JevDecisions(config.jev);
const input={surface:'interior',event:'observe',automatic:true,intentId:null,expectedRevision:0,target:null};
for(const [name,needs,expected] of [
 ['hungry',{hunger:.82,fatigue:.1,stimulation:.1,alertness:.1},'eat'],
 ['sleepy',{hunger:.1,fatigue:.82,stimulation:.1,alertness:.1},'sleep'],
 ['overhandled',{hunger:.1,fatigue:.1,stimulation:.1,alertness:.78},'retreat'],
]){
 const now=Date.now(),state=initialCat('synthetic-'+name,now);state.needs=needs;
 if(name==='overhandled'){state.touches=5;state.temperament.sensitivity=.75;}
 const options=catOptions(state,input,now);
 const choice=await client.decide('synthetic-'+name,0,state,name==='overhandled'?'stroke':'observe',options,now);
 const action=choice?options[choice]?.activity:undefined;
 console.log(JSON.stringify({case:name,model:config.jev.model,action:action??null,elapsedMs:Date.now()-now,passed:action===expected}));
 assert.equal(action,expected,`Jev case ${name} needs review`);
}
