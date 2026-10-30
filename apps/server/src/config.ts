import { resolve } from 'node:path';
export interface Config {
  databaseUrl: string;
  port: number;
  host: string;
  origins: string[];
  mode: 'development' | 'test' | 'production';
  jev?: { baseUrl: string; apiKey: string; model: string; dailyCalls: number };
  chat?: { baseUrl: string; apiKey: string; model: string; dailyTurns: number };
  memory?: { databaseUrl: string; apiKey: string };
  speech?: { apiKey: string; baseUrl: string; model: string };
  mediaRoot?: string;
  images?: { apiKey: string; baseUrl: string; model: string; size: '2K'; unitPriceFen: number; dailyBudgetFen: number; referencePath: string };
}
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = env.NODE_ENV;
  if (!['development', 'test', 'production'].includes(mode ?? '')) throw new Error('NODE_ENV must be development, test or production');
  let url: URL;
  try { url = new URL(env.DATABASE_URL ?? ''); } catch { throw new Error('DATABASE_URL is required'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname === '/') throw new Error('Invalid DATABASE_URL');
  const port = Number(env.PORT ?? 3100);
  if (!Number.isInteger(port) || port < 0 || port > 65535 || (port === 0 && mode !== 'test')) throw new Error('Invalid PORT');
  const host = env.HOST ?? '127.0.0.1';
  if (!['127.0.0.1', '::1'].includes(host)) throw new Error('This development service must listen on loopback');
  const origins = (env.CLIENT_ORIGIN ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (!origins.length) throw new Error('CLIENT_ORIGIN is required');
  for (const origin of origins) {
    let parsed: URL;
    try { parsed = new URL(origin); } catch { throw new Error('Invalid CLIENT_ORIGIN'); }
    if (parsed.origin !== origin || !['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid CLIENT_ORIGIN');
    if (parsed.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) throw new Error('Non-loopback origins require HTTPS');
  }
  let jev: Config['jev'];
  if (env.TOKEN_HUB_API_KEY) {
    const baseUrl = env.TOKEN_HUB_API_BASE_URL ?? 'https://us-api.tokenhub.com/v1';
    let endpoint: URL;
    try { endpoint = new URL(baseUrl); } catch { throw new Error('Invalid TOKEN_HUB_API_BASE_URL'); }
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/v1') throw new Error('TOKEN_HUB_API_BASE_URL must be an HTTPS /v1 endpoint');
    const model = env.PET_LIFE_MODEL ?? 'jev-1.14';
    if (!/^jev-[a-z0-9.-]+$/.test(model)) throw new Error('PET_LIFE_MODEL must name a Jev decision model');
    const dailyCalls = Number(env.PET_LIFE_DAILY_CALLS ?? 240);
    if (!Number.isInteger(dailyCalls) || dailyCalls < 1 || dailyCalls > 2000) throw new Error('PET_LIFE_DAILY_CALLS must be 1–2000');
    jev = { baseUrl, apiKey: env.TOKEN_HUB_API_KEY, model, dailyCalls };
  } else if (env.TOKEN_HUB_API_BASE_URL || env.PET_LIFE_MODEL || env.PET_LIFE_DAILY_CALLS) throw new Error('TOKEN_HUB_API_KEY is required for configured Jev decisions');
  let chat: Config['chat'];
  if (env.PET_CHAT_ENABLED === 'true') {
    if (!jev) throw new Error('TOKEN_HUB_API_KEY is required for pet chat');
    const model = env.PET_CHAT_MODEL ?? 'claude-haiku-5.5';
    if (!/^claude-haiku-[a-z0-9.-]+$/.test(model)) throw new Error('PET_CHAT_MODEL must name a Haiku model');
    const dailyTurns = Number(env.PET_CHAT_DAILY_TURNS ?? 100);
    if (!Number.isInteger(dailyTurns) || dailyTurns < 1 || dailyTurns > 10000) throw new Error('Invalid PET_CHAT_DAILY_TURNS');
    chat = { apiKey: jev.apiKey, baseUrl: jev.baseUrl, model, dailyTurns };
  } else if (env.PET_CHAT_ENABLED && env.PET_CHAT_ENABLED !== 'false') throw new Error('PET_CHAT_ENABLED must be true or false');
  let memory: Config['memory'];
  if (env.MEM0_DATABASE_URL) {
    if (!chat) throw new Error('Pet chat must be enabled for mem0');
    const db = new URL(env.MEM0_DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(db.protocol) || !db.hostname || db.pathname === '/') throw new Error('Invalid MEM0_DATABASE_URL');
    const apiKey = env.HUOSHAN_API_KEY || env.ARK_API_KEY;
    if (!apiKey) throw new Error('HUOSHAN_API_KEY or ARK_API_KEY is required for mem0 embeddings');
    memory = { databaseUrl: db.toString(), apiKey };
  }
  let speech: Config['speech'];
  if (env.ASR_API_KEY) {
    const base = new URL(env.ASR_BASE_URL ?? 'https://dashscope.aliyuncs.com/compatible-mode/v1');
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !base.pathname.endsWith('/v1')) throw new Error('Invalid ASR_BASE_URL');
    const model = env.ASR_MODEL ?? 'qwen3-asr-flash';
    if (!/^qwen[\w.-]+asr[\w.-]*$/.test(model)) throw new Error('Invalid ASR_MODEL');
    speech = { apiKey: env.ASR_API_KEY, baseUrl: base.toString().replace(/\/$/, ''), model };
  }
  let images: Config['images'];
  if (env.SEEDREAM_API_KEY) {
    const base = new URL(env.SEEDREAM_BASE_URL ?? 'https://ark.cn-beijing.volces.com/api/v3');
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !base.pathname.endsWith('/api/v3')) throw new Error('Invalid SEEDREAM_BASE_URL');
    const model = env.SEEDREAM_MODEL ?? 'doubao-seedream-5-0-flash-260915';
    if (model !== 'doubao-seedream-5-0-flash-260915' && !(mode === 'test' && model === 'doubao-seedream-test')) throw new Error('Unsupported SEEDREAM_MODEL; verify the adapter and price before changing models');
    const unitPriceFen = Number(env.SEEDREAM_UNIT_PRICE_FEN), dailyBudgetFen = Number(env.IMAGE_DAILY_BUDGET_FEN ?? 1000);
    if (!Number.isSafeInteger(unitPriceFen) || unitPriceFen < 1 || unitPriceFen > 10000) throw new Error('Configure a verified SEEDREAM_UNIT_PRICE_FEN');
    if (model === 'doubao-seedream-5-0-flash-260915' && unitPriceFen < 12) throw new Error('SEEDREAM_UNIT_PRICE_FEN is below the verified 2K price');
    if (!Number.isSafeInteger(dailyBudgetFen) || dailyBudgetFen < 1 || dailyBudgetFen > 100000) throw new Error('Invalid IMAGE_DAILY_BUDGET_FEN');
    images = { apiKey: env.SEEDREAM_API_KEY, baseUrl: base.toString().replace(/\/$/, ''), model, size: '2K', unitPriceFen, dailyBudgetFen, referencePath: resolve(env.PET_IMAGE_REFERENCE_PATH ?? 'assets/characters/calico/calico-character-reference-v1.png') };
  }
  return { databaseUrl: url.toString(), port, host, origins, mode: mode as Config['mode'], mediaRoot: resolve(env.PET_MEDIA_DIR ?? '.data/pet-images'), ...(images ? { images } : {}), ...(jev ? { jev } : {}), ...(chat ? { chat } : {}), ...(memory ? { memory } : {}), ...(speech ? { speech } : {}) };
}
