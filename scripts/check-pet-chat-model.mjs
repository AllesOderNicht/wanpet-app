// Synthetic prompts only; no player data or credentials are printed.
import { CodexPetAgent } from '../apps/server/src/pet-agent.ts';
import assert from 'node:assert/strict';
const agent = new CodexPetAgent({ apiKey: process.env.TOKEN_HUB_API_KEY, baseUrl: process.env.TOKEN_HUB_API_BASE_URL ?? 'https://us-api.tokenhub.com/v1', model: process.env.PET_CHAT_MODEL ?? 'claude-haiku-5.5' });
let reply = '', calls = [];
const run = async prompt => {
  reply = '';
  await agent.run({ prompt: JSON.stringify(prompt), signal: AbortSignal.timeout(120000), text: async text => { reply = text; }, tool: async (name, args) => {
    calls.push(name);
    if (name === 'get_pet_state') return { nickname: '小丸', status: 'AT_HOME' };
    assert.equal(name, 'invite_pet'); assert.equal(args.activity, 'approach');
    return { activity: 'approach', outcome: 'declined', stage: 'requested', reason: '正在睡觉' };
  }});
};
try {
  await run({ user: '你好，我的名字叫蓝莓。请简短打个招呼。' }); assert.ok(reply.includes('蓝莓')); console.log('PASS greeting');
  await run({ history: [{ role: 'user', content: '我的名字叫蓝莓' }, { role: 'assistant', content: reply }], user: '我叫什么名字？' }); assert.ok(reply.includes('蓝莓')); console.log('PASS context');
  await run({ user: '请调用 invite_pet 邀请你靠近我（approach），并按真实结果回复。' }); console.log(JSON.stringify({ calls, syntheticReply: reply })); assert.ok(calls.includes('invite_pet'), 'pet tool must execute'); assert.ok(/睡|拒绝|不愿|不过来|不想/.test(reply), 'reply must reflect declined invitation'); console.log('PASS pet tool result');
} catch (error) { console.error('FAIL', error instanceof Error ? error.message.replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]') : 'model check failed'); process.exitCode = 1; }
