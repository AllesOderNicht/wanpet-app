import type { Config } from './config';
import { MAX_IMAGE_BYTES } from './image-store';

export interface ImageProvider {
  generate(input: { prompt: string; references: Buffer[]; signal: AbortSignal }): Promise<{ url: string }>;
  download(url: string, signal: AbortSignal): Promise<Buffer>;
}
export class ImageProviderError extends Error {
  constructor(readonly code: string, readonly noCharge = false) { super(code); }
}
export async function boundedBody(response: Response, limit: number): Promise<Buffer> {
  if (Number(response.headers.get('content-length')) > limit || !response.body) throw new Error('Invalid image response');
  const reader = response.body.getReader(), parts: Uint8Array[] = []; let size = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > limit) throw new Error('Image response too large'); parts.push(value); } }
  finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(parts);
}
export function seedreamResultUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Missing image URL');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || !['volces.com', 'byteimg.com', 'volcengine.com'].some(domain => url.hostname.endsWith('.' + domain))) throw new Error('Untrusted image URL');
  return url.toString();
}
export class SeedreamProvider implements ImageProvider {
  constructor(private config: NonNullable<Config['images']>, private request: typeof fetch = fetch) {}
  async generate(input: { prompt: string; references: Buffer[]; signal: AbortSignal }) {
    const response = await this.request(this.config.baseUrl + '/images/generations', {
      method: 'POST', redirect: 'error', signal: input.signal,
      headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.config.model, prompt: input.prompt, size: this.config.size, response_format: 'url', ...(/seedream-5-0-(?:flash|pro)-/.test(this.config.model) ? {} : { sequential_image_generation: 'disabled' }), watermark: true, stream: false,
        ...(input.references.length ? { image: input.references.map(bytes => 'data:image/jpeg;base64,' + bytes.toString('base64')) } : {}) }),
    });
    if (!response.ok) {
      let code: string | undefined;
      try {
        const body = JSON.parse((await boundedBody(response, 128 * 1024)).toString());
        const value = body?.error?.code;
        if (typeof value === 'string' && /^[A-Za-z][A-Za-z_.]{0,100}$/.test(value)) code = value;
      } catch { /* Never log a raw provider body, which may contain private input. */ }
      console.warn(JSON.stringify({ event: 'image_provider_rejected', status: response.status, code }));
      // Only pre-inference request rejection is known not to have produced a billable image.
      throw new ImageProviderError(response.status === 429 ? 'IMAGE_PROVIDER_LIMIT' : 'IMAGE_PROVIDER_FAILED', [400, 401, 403, 404, 422, 429].includes(response.status));
    }
    const body = JSON.parse((await boundedBody(response, 128 * 1024)).toString()) as { data?: Array<{ url?: string }>; usage?: { generated_images?: number } };
    if (!Array.isArray(body.data) || body.data.length !== 1 || (body.usage?.generated_images != null && body.usage.generated_images !== 1)) throw new ImageProviderError('IMAGE_PROVIDER_INVALID_RESULT');
    return { url: seedreamResultUrl(body.data[0]?.url) };
  }
  async download(url: string, signal: AbortSignal) {
    const response = await this.request(seedreamResultUrl(url), { signal, redirect: 'error' });
    if (!response.ok) { await response.body?.cancel(); throw new Error('Image download failed'); }
    return boundedBody(response, MAX_IMAGE_BYTES);
  }
}
