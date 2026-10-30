import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AgentConfig } from './pet-agent';
export const PET_TOOL_NAMES = ['get_pet_state', 'invite_pet', 'generate_image', 'propose_image', 'gift_image'];
const petTools = PET_TOOL_NAMES;
export function restrictPetTools(request: Record<string, any>) {
  const namespace = request.tools?.find((tool: any) => tool.type === 'namespace' && tool.name === 'mcp__pet');
  if (!namespace || !Array.isArray(namespace.tools)) throw new Error('PET_TOOLS_MISSING');
  const tools = namespace.tools.filter((tool: any) => tool.type === 'function' && petTools.includes(tool.name));
  if (tools.length !== petTools.length || new Set(tools.map((tool: any) => tool.name)).size !== petTools.length) throw new Error('PET_TOOLS_MISSING');
  return { ...request, tools: [{ ...namespace, tools }] };
}
export function assertPetToolCalls(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach(assertPetToolCalls); return; }
  const item = value as Record<string, unknown>;
  if (typeof item.type === 'string' && item.type.endsWith('_call')) {
    const allowed = item.type === 'function_call' && ((item.namespace === 'mcp__pet' && petTools.includes(String(item.name))) || (item.namespace == null && petTools.some(name => item.name === `mcp__pet__${name}`)));
    if (!allowed) throw new Error('UNEXPECTED_AGENT_TOOL');
  }
  Object.values(item).forEach(assertPetToolCalls);
}
/** Fail closed before any upstream tool call reaches the CLI executor. No arbitrary destination or headers. */
export async function proxyPetResponse(req: IncomingMessage, res: ServerResponse, config: AgentConfig, signal: AbortSignal) {
  const cancelled = new AbortController();
  res.on('close', () => cancelled.abort());
  try {
    let body = ''; for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 48 * 1024 * 1024) throw new Error('Too large'); }
    const request = restrictPetTools(JSON.parse(body));
    const upstream = await fetch(config.baseUrl + '/responses', { method: 'POST', redirect: 'error', signal: AbortSignal.any([signal, cancelled.signal]), headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(request) });
    if (!upstream.ok || !upstream.body || !upstream.headers.get('content-type')?.includes('text/event-stream')) throw new Error('MODEL_REQUEST_FAILED');
    const reader = upstream.body.getReader(), decoder = new TextDecoder();
    let pending = '', size = 0;
    try {
      for (;;) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.length; if (size > 8 * 1024 * 1024) throw new Error('MODEL_REPLY_TOO_LARGE');
        pending = (pending + decoder.decode(chunk.value, { stream: true })).replace(/\r\n/g, '\n');
        let end: number;
        while ((end = pending.indexOf('\n\n')) !== -1) {
          const event = pending.slice(0, end); pending = pending.slice(end + 2);
          const data = event.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
          if (data && data !== '[DONE]') assertPetToolCalls(JSON.parse(data));
          if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
          res.write(event + '\n\n');
        }
      }
      if (pending.trim()) throw new Error('MODEL_REPLY_INCOMPLETE');
      res.end();
    } finally { await reader.cancel().catch(() => {}); }
  } catch {
    if (res.headersSent) res.destroy();
    else res.writeHead(502, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: { message: 'Pet model request failed', type: 'upstream_error' } }));
  }
}
