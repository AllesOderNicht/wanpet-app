import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { ApiError } from './errors';

export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('base64url');
export function object(input: unknown, fields: string[], optional: string[] = []): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Object.keys(input).every(k => fields.includes(k) || optional.includes(k)) || !fields.every(k => Object.hasOwn(input, k))) throw new ApiError(400, 'INVALID_INPUT', 'Unexpected request fields');
  return input as Record<string, unknown>;
}
export function username(value: unknown): string {
  if (typeof value !== 'string' || value.length > 128) throw new ApiError(400, 'INVALID_INPUT', 'Invalid username');
  const result = value.trim();
  if ([...result].length < 1 || [...result].length > 32 || /[\p{Cc}\p{Cs}]/u.test(result)) throw new ApiError(400, 'INVALID_USERNAME', 'Username must be 1–32 characters');
  return result;
}
export function email(value: unknown): string {
  if (typeof value !== 'string' || value.length > 512) throw new ApiError(400, 'INVALID_EMAIL', 'Invalid email address');
  const result = value.trim().toLowerCase();
  const parts = result.split('@');
  if (result.length > 254 || parts.length !== 2 || !/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]{1,64}$/.test(parts[0]!) || parts[0]!.startsWith('.') || parts[0]!.endsWith('.') || parts[0]!.includes('..') || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(parts[1]!)) throw new ApiError(400, 'INVALID_EMAIL', 'Invalid email address');
  return result;
}
export function password(value: unknown): string {
  if (typeof value !== 'string' || /[\uD800-\uDFFF]/u.test(value) || value.length > 256 || [...value].length < 9 || [...value].length > 128 || Buffer.byteLength(value) > 512) throw new ApiError(400, 'INVALID_PASSWORD', 'Password must be 9–128 characters and at most 512 UTF-8 bytes');
  return value;
}
export function idempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new ApiError(400, 'INVALID_INPUT', 'A valid Idempotency-Key is required');
  return value;
}

export class Passwords {
  private active = false;
  private queue: Array<() => void> = [];
  readonly dummy = this.hash('not-a-real-account-password');
  private async derive(value: string, salt: Buffer): Promise<Buffer> {
    if (this.active) {
      if (this.queue.length >= 8) throw new ApiError(503, 'SERVER_BUSY', 'Authentication is busy', 1);
      await new Promise<void>(resolve => this.queue.push(resolve));
    } else this.active = true;
    try {
      return await new Promise<Buffer>((resolve, reject) => scrypt(value, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
    } finally {
      const next = this.queue.shift();
      if (next) next(); else this.active = false;
    }
  }
  async hash(value: string): Promise<string> {
    const salt = randomBytes(16);
    const result = await this.derive(value, salt);
    return `scrypt$131072$8$1$${salt.toString('hex')}$${result.toString('hex')}`;
  }
  async verify(value: string, stored: string): Promise<boolean> {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts.slice(0, 4).join('$') !== 'scrypt$131072$8$1' || !/^[a-f0-9]{32}$/.test(parts[4]!) || !/^[a-f0-9]{128}$/.test(parts[5]!)) throw new Error('Unsupported password hash');
    const result = await this.derive(value, Buffer.from(parts[4]!, 'hex'));
    return timingSafeEqual(result, Buffer.from(parts[5]!, 'hex'));
  }
}

// shortcut: process-local limits suit the single-instance development service; use shared storage before scaling.
export class RateLimits {
  private buckets = new Map<string, { count: number; until: number }>();
  take(key: string, max: number, windowMs: number, now = Date.now()) {
    for (const [id, entry] of this.buckets) if (entry.until <= now) this.buckets.delete(id);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= 10000) throw new ApiError(503, 'SERVER_BUSY', 'Rate limiter is busy', 1);
      bucket = { count: 0, until: now + windowMs }; this.buckets.set(key, bucket);
    }
    if (bucket.count >= max) throw new ApiError(429, 'RATE_LIMITED', 'Too many requests', Math.max(1, Math.ceil((bucket.until - now) / 1000)));
    bucket.count++;
  }
}
