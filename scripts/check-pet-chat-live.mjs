// End-to-end acceptance uses a dedicated test database and synthetic account only.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from '../apps/server/dist/bootstrap.js';
import { loadConfig } from '../apps/server/dist/config.js';
import { GameService } from '../apps/server/dist/service.js';
import { ChatService } from '../apps/server/dist/chat-service.js';
import { SpeechService } from '../apps/server/dist/speech-service.js';
const databaseUrl=process.env.TEST_DATABASE_URL;
if(!databaseUrl||!/^wanpet_test(?:_[a-z0-9]+)?$/.test(new URL(databaseUrl).pathname.slice(1)))throw Error('Isolated TEST_DATABASE_URL required');
const serve=process.argv.includes('--serve');
const config=loadConfig({...process.env,NODE_ENV:'test',DATABASE_URL:databaseUrl,PORT:serve?'31823':'0',CLIENT_ORIGIN:'http://localhost:5173',PET_CHAT_ENABLED:'true',...(serve?{ASR_API_KEY:'synthetic-test-transcriber'}:{})});
const app=await createApp(config);await app.listen(config.port,'127.0.0.1');
const game=app.get(GameService),chat=app.get(ChatService);
const username='chatqa_'+randomUUID().slice(0,8);
const auth=await game.register((username) + "@example.test", username,'Wanpet-Chat-QA-2026');
const identity=await game.authenticate('Bearer '+auth.accessToken);
const initial=(await game.initialize(identity,'initial')).snapshot;
if(serve){
 app.get(SpeechService).transcribe=async audio=>{console.log(JSON.stringify({event:'synthetic_asr',wavBytes:audio.length}));return '请过来陪我';};
 console.log(JSON.stringify({api:await app.getUrl(),username,mockSpeech:true}));
}else{
 const wait=async check=>{for(let n=0;n<180;n++){if(await check())return;await new Promise(resolve=>setTimeout(resolve,1000));}throw Error('Acceptance timed out');};
 const send=async text=>{const {body}=await chat.submit(identity,randomUUID(),{text,surface:'interior'});await wait(async()=>!['queued','running'].includes((await game.db.chatTurn.findUniqueOrThrow({where:{id:body.id}})).status));const turn=await game.db.chatTurn.findUniqueOrThrow({where:{id:body.id}});assert.equal(turn.status,'completed',turn.error??'model failed');return turn;};
 try{
  assert.ok(config.memory,'MEM0_DATABASE_URL is required for the complete memory check');
  const first=await send('请记住，我最喜欢的点心是蓝莓派。');console.log('PASS real Haiku reply');
  await wait(async()=>(await chat.memories(identity)).items.some(m=>m.text.includes('蓝莓')));console.log('PASS real mem0 extraction');
  await chat.control(identity,randomUUID(),first.id,'delete');
  await wait(async()=>!(await game.db.chatRoom.findUniqueOrThrow({where:{petId:initial.pet.id}})).needsReindex);
  const recall=await send('我最喜欢什么点心？');assert.match(recall.reply,/蓝莓/);console.log('PASS recall after original chat deletion');
  const action=await send('请邀请你靠近我，调用 invite_pet 的 approach，并告诉我真实结果。');assert.ok(action.invitation);console.log(JSON.stringify({event:'pet_tool_result',outcome:action.invitation.outcome,decisionSource:action.invitation.life.decisionSource}));console.log('PASS real Haiku → CatLife invitation');
  await chat.manageMemory(identity,randomUUID(),'clear');
  await wait(async()=>!(await game.db.chatRoom.findUniqueOrThrow({where:{petId:initial.pet.id}})).needsReindex);
  let captured='';const runner=chat.agent;chat.agent={run:async request=>{captured=request.prompt;return runner.run(request);}};
  await send('你现在还记得我的点心偏好吗？不知道就直说。');assert.doesNotMatch(captured,/蓝莓/);assert.deepEqual((await game.snapshot(identity)).inventory,initial.inventory);console.log('PASS forgotten fact excluded from new model context; inventory unchanged');
 }finally{await app.close();}
}
