const ENDPOINT = 'https://ark.cn-beijing.volces.com/api/v3/embeddings/multimodal';
const DIMENSIONS = 2048;
const INSTRUCTIONS = 'Target_modality: text.\nInstruction:Retrieve semantically similar memories about the user and their pet\nQuery:';

// mem0 uses embedQuery for both searches and some writes, so use symmetric retrieval instructions.
export class ArkEmbedder {
  constructor(private readonly apiKey: string, private readonly request: typeof fetch = fetch) {}
  async embedQuery(text: string): Promise<number[]> { return (await this.embedDocuments([text]))[0]; }
  async embedDocuments(texts: string[]): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let offset = 0; offset < texts.length; offset += 3) {
      vectors.push(...await Promise.all(texts.slice(offset, offset + 3).map(async text => {
      const response = await this.request(ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: 'doubao-embedding-vision-251215', input: [{ type: 'text', text }], encoding_format: 'float', instructions: INSTRUCTIONS }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`Ark embedding request failed (${response.status})`);
      const result: unknown = await response.json();
      const embedding = (result as { data?: { embedding?: unknown } })?.data?.embedding;
      if (!Array.isArray(embedding) || embedding.length !== DIMENSIONS || !embedding.every((v: unknown) => typeof v === 'number' && Number.isFinite(v))) throw new Error('Invalid Ark embedding response');
      return embedding as number[];
      })));
    }
    return vectors;
  }
}
