import { test } from 'node:test';
import assert from 'node:assert/strict';
import { speechAudio } from '../src/speech-service';
import { explicitlyRemember, mayRemember } from '../src/memory-policy';
import { chatText, resourceId } from '../src/chat-service';
import { loadConfig } from '../src/config';
import { initialCat, advanceCat, catOptions, catLifeRequest } from '../src/cat-life';
import { assertPetToolCalls, restrictPetTools, PET_TOOL_NAMES } from '../src/pet-model-proxy';
import { rebuildMemoryEntries } from '../src/memory-rebuild';
import { ArkEmbedder } from '../src/ark-embedder';
import type { StoredMemory } from '../src/memory-gateway';

test('Ark embeddings use separate inputs, preserve ordering, and reject invalid dimensions', async () => {
  const calls: any[] = [];
  const request: typeof fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body)); calls.push(body);
    return Response.json({ data: { embedding: Array(2048).fill(body.input[0].text === '乙' ? 2 : 1) } });
  };
  const embedder = new ArkEmbedder('synthetic', request);
  assert.equal((await embedder.embedQuery('你好'))[0], 1);
  assert.equal(calls[0].model, 'doubao-embedding-vision-251215');
  assert.deepEqual(calls[0].input, [{ type: 'text', text: '你好' }]);
  assert.match(calls[0].instructions, /Target_modality: text/);
  assert.deepEqual((await embedder.embedDocuments(['甲', '乙'])).map(v => v[0]), [1, 2]);
  const invalid = new ArkEmbedder('synthetic', async () => Response.json({ data: { embedding: [1] } }));
  await assert.rejects(invalid.embedQuery('你好'), /Invalid Ark embedding response/);
});

test('mem0 LangChain provider calls the Ark adapter for single and batch embeddings', async () => {
  const { LangchainEmbedder } = await import('mem0ai/oss');
  const calls: string[][] = [];
  const request: typeof fetch = async (_url, init) => {
    const { input } = JSON.parse(String(init?.body)) as { input: Array<{ text: string }> }; calls.push(input.map(x => x.text));
    return Response.json({ data: { embedding: Array(2048).fill(0.1) } });
  };
  const embedder = new LangchainEmbedder({ model: new ArkEmbedder('synthetic', request) });
  await embedder.embed('主人喜欢甜瓜');
  await embedder.embedBatch(['喜欢什么']);
  assert.deepEqual(calls, [['主人喜欢甜瓜'], ['喜欢什么']]);
});

test('memory index rebuild resumes after interruption instead of repeatedly erasing progress', async () => {
  const entries = ['a', 'b', 'c'].map(id => ({ id, text: 'preference ' + id, sourceTurnId: null }));
  const values: StoredMemory[] = []; let interrupted = true;
  const backend = {
    all: async () => values.slice(),
    remove: async (id: string) => { values.splice(values.findIndex(v => v.id === id), 1); },
    add: async (entry: typeof entries[number]) => { if (entry.id === 'b' && interrupted) throw new Error('worker interrupted'); values.push({ id: entry.id, memory: entry.text, metadata: { entryId: entry.id } }); },
  };
  await assert.rejects(rebuildMemoryEntries(entries, backend)); assert.equal(values.length, 1);
  interrupted = false; await rebuildMemoryEntries(entries, backend); assert.equal(values.length, 3);
  await rebuildMemoryEntries(entries, backend); assert.equal(values.length, 3);
});

test('model boundary removes generic tools and rejects unsolicited tool calls before execution', () => {
  const pet = { type: 'namespace', name: 'mcp__pet', tools: [...PET_TOOL_NAMES.map(name => ({ type: 'function', name })), { type: 'function', name: 'shell' }] };
  const filtered = restrictPetTools({ tools: [{ type: 'function', name: 'view_image' }, pet] });
  assert.equal(filtered.tools.length, 1); assert.deepEqual(filtered.tools[0].tools.map((t: any) => t.name), PET_TOOL_NAMES);
  assert.throws(() => restrictPetTools({ tools: [] }));
  assertPetToolCalls({ type: 'response.output_item.done', item: { type: 'function_call', namespace: 'mcp__pet', name: 'invite_pet' } });
  assertPetToolCalls({ type: 'response.completed', response: { output: [{ type: 'function_call', name: 'mcp__pet__get_pet_state' }] } });
  for (const item of [{ type: 'function_call', name: 'view_image' }, { type: 'function_call', namespace: 'mcp__other', name: 'invite_pet' }, { type: 'custom_tool_call', name: 'apply_patch' }, { type: 'web_search_call' }]) assert.throws(() => assertPetToolCalls({ response: { output: [item] } }));
});

export function wav(seconds = 1) {
  const data = Buffer.alloc(44 + seconds * 32000);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(16000, 24); data.writeUInt32LE(32000, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(data.length - 44, 40);
  return data;
}
test('speech validates real WAV duration, sample format and truncation', () => {
  assert.deepEqual(speechAudio({ audio: wav(60).toString('base64') }), wav(60));
  for (const audio of [Buffer.from('fake'), wav(61), wav(1).subarray(0, 100)]) assert.throws(() => speechAudio({ audio: audio.toString('base64') }));
  const stereo = wav(); stereo.writeUInt16LE(2, 22); assert.throws(() => speechAudio({ audio: stereo.toString('base64') }));
  assert.throws(() => speechAudio({ audio: wav().toString('base64'), userId: 'someone' }));
});
test('ordinary memories are automatic; sensitive facts require explicit remembering; secrets are excluded', () => {
  assert.equal(mayRemember('我喜欢蓝莓'), true);
  assert.equal(mayRemember('我对花生过敏'), false);
  assert.equal(mayRemember('请记住我对花生过敏', explicitlyRemember('请记住我对花生过敏')), true);
  assert.equal(explicitlyRemember('不要记住我的住址'), false);
  assert.equal(mayRemember('不要记住我喜欢甜瓜'), false);
  assert.equal(mayRemember('请记住我的密码 abc', true), false);
});
test('chat accepts bounded text and only explicitly configured models', () => {
  assert.equal(chatText('  你好  '), '你好');
  assert.throws(() => chatText('a'.repeat(4001))); assert.throws(() => resourceId('../me'));
  const base = { NODE_ENV: 'test', PORT: '0', DATABASE_URL: 'postgresql://localhost/wanpet_test', CLIENT_ORIGIN: 'http://localhost:5173' };
  assert.equal(loadConfig(base).chat, undefined);
  const configured = loadConfig({ ...base, TOKEN_HUB_API_KEY: 'synthetic', PET_CHAT_ENABLED: 'true' });
  assert.equal(configured.chat?.model, 'claude-haiku-5.5'); assert.equal(configured.chat?.dailyTurns, 100);
  assert.throws(() => loadConfig({ ...base, PET_CHAT_ENABLED: 'true' }));
  assert.throws(() => loadConfig({ ...base, TOKEN_HUB_API_KEY: 'synthetic', PET_CHAT_ENABLED: 'true', PET_CHAT_MODEL: 'gpt-other' }));
});
test('a chat invitation preserves the cat needs and may be refused', () => {
  const ordinary = { surface: 'interior', event: 'observe', automatic: true, intentId: null, expectedRevision: 0, target: null };
  assert.deepEqual(catLifeRequest(ordinary), ordinary);
  assert.throws(() => catLifeRequest({ ...ordinary, unexpected: true }));
  const state = initialCat('test', Date.now()); state.needs.fatigue = 1;
  const request = catLifeRequest({ surface: 'interior', event: 'invite', automatic: true, intentId: null, expectedRevision: 0, target: 'shelter', invitedActivity: 'approach' });
  const next = advanceCat(state, request, state.updatedAt, 0);
  assert.equal(next.invitation?.activity, 'approach');
  assert.ok(Object.values(catOptions(next, request, state.updatedAt)).every(o => ['sleep', 'rest'].includes(o.activity)));
  assert.throws(() => catLifeRequest({ ...request, event: 'observe', target: null }));
});
