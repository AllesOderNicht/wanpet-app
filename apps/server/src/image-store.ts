import sharp from 'sharp';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ApiError } from './errors';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export class ImageStore {
  constructor(readonly root: string) {}
  path(id: string, preview = false) {
    if (!uuid.test(id)) throw new ApiError(400, 'INVALID_INPUT', 'Invalid image id');
    return join(this.root, id + (preview ? '.preview.jpg' : '.jpg'));
  }
  async normalize(bytes: Buffer, maxSide = 2048) {
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new ApiError(413, 'IMAGE_TOO_LARGE', 'Image must be at most 10 MiB');
    try {
      const decoded = sharp(bytes, { limitInputPixels: 36_000_000, failOn: 'warning', animated: false });
      const meta = await decoded.metadata();
      if (!['jpeg', 'png', 'webp', 'heif'].includes(meta.format ?? '') || (meta.pages ?? 1) !== 1 || !meta.width || !meta.height || meta.width < 15 || meta.height < 15) throw new Error('Unsupported image');
      // Re-encoding removes EXIF, embedded payloads and original filenames.
      const { data, info } = await decoded.rotate().resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 88 }).toBuffer({ resolveWithObject: true });
      return { data, width: info.width, height: info.height, bytes: data.length };
    } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, 'INVALID_IMAGE', 'Upload a valid JPEG, PNG, WebP or supported HEIC image'); }
  }
  async save(id: string, normalized: { data: Buffer }) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const preview = await sharp(normalized.data).resize(640, 640, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
    for (const [small, bytes] of [[false, normalized.data], [true, preview]] as const) {
      const path = this.path(id, small), temp = path + '.' + randomUUID() + '.tmp';
      try { await writeFile(temp, bytes, { flag: 'wx', mode: 0o600 }); await rename(temp, path); }
      finally { await rm(temp, { force: true }); }
    }
  }
  async read(id: string, preview = false) { return readFile(this.path(id, preview)); }
  async remove(id: string) { await Promise.all([false, true].map(preview => rm(this.path(id, preview), { force: true }))); }
  async cleanOrphans(kept: Set<string>, before: number) {
    const names = await readdir(this.root).catch(() => []);
    for (const name of names) {
      const id = name.slice(0, 36);
      if (!uuid.test(id) || (!name.endsWith('.tmp') && kept.has(id))) continue;
      const path = join(this.root, name), info = await stat(path).catch(() => null);
      if (info?.isFile() && info.mtimeMs < before) await rm(path, { force: true });
    }
  }
}

export function uploadedBytes(value: unknown): Buffer {
  if (typeof value !== 'string' || !value.length || value.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) throw new ApiError(400, 'INVALID_IMAGE', 'Invalid image data');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) throw new ApiError(400, 'INVALID_IMAGE', 'Invalid image data');
  return bytes;
}
