import { MEMORY_INSTRUCTIONS, explicitlyRemember, mayRemember } from './memory-policy';
import { rebuildMemoryEntries } from './memory-rebuild';
import { ArkEmbedder } from './ark-embedder';
// Fork-only worker. Credentials and conversation data travel over private IPC, never command arguments.
process.on('disconnect', () => process.exit(0));
process.once('message', async (input: any) => {
  let phase = 'initialize';
  try {
    if (!/^[a-f0-9-]{36}:\d+$/.test(input.scope)) throw new Error('Invalid scope');
    const { Memory } = await import('mem0ai/oss');
    const memory = new Memory({
      disableHistory: true, customInstructions: MEMORY_INSTRUCTIONS,
      llm: { provider: 'openai', config: { apiKey: input.config.chat.apiKey, baseURL: input.config.chat.baseUrl, model: input.config.chat.model, timeout: 20000 } },
      embedder: { provider: 'langchain', config: { model: new ArkEmbedder(input.config.memory.apiKey) } },
      vectorStore: { provider: 'pgvector', config: { connectionString: input.config.memory.databaseUrl, collectionName: 'wanpet_memories_vision_251215', dimension: 2048, embeddingModelDims: 2048 } },
    });
    const scope = input.scope as string;
    phase = input.operation;
    let items: unknown[] = [];
    if (input.operation === 'search') items = (await memory.search(input.query, { filters: { user_id: scope }, topK: 8 })).results;
    else if (input.operation === 'purge') await memory.deleteAll({ userId: scope });
    else {
      if (input.operation === 'rebuild') {
        await rebuildMemoryEntries(input.items, {
          all: async () => (await memory.getAll({ filters: { user_id: scope }, topK: 10000 })).results,
          remove: id => memory.delete(id),
          add: item => memory.add(item.text, { userId: scope, infer: false, metadata: { entryId: item.id, sourceTurnId: item.sourceTurnId } }),
        });
      } else if (input.operation === 'extract' && mayRemember(input.text, explicitlyRemember(input.text))) {
        await memory.add([{ role: 'user', content: input.text }], { userId: scope, metadata: { sourceTurnId: input.sourceTurnId } });
      }
      phase = 'snapshot';
      const result = await memory.getAll({ filters: { user_id: scope }, topK: 10000 });
      if (result.results.length >= 10000) throw new Error('Memory snapshot limit reached');
      for (const item of result.results) {
        if (input.operation === 'extract' && !mayRemember(item.memory, explicitlyRemember(input.text)) && item.metadata?.sourceTurnId === input.sourceTurnId) await memory.delete(item.id);
        else items.push(item);
      }
    }
    process.send?.({ items }, () => process.exit(0));
  } catch (error: any) {
    const kind = typeof error?.name === 'string' && /^[A-Za-z]{1,50}$/.test(error.name) ? error.name : 'Error';
    const code = typeof error?.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : undefined;
    const httpStatus = Number.isInteger(error?.status) ? error.status : undefined;
    process.send?.({ fault: { phase, kind, code, httpStatus } }, () => process.exit(1));
  }
});
