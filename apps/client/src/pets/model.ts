export type Point = { x: number; y: number };
export type Bounds = { left: number; right: number; top: number; bottom: number };
export type ClipName = 'idle' | 'walkLeft' | 'walkRight';
export interface PetFrame {
  texture: string;
  rect: [number, number, number, number];
  bounds: [number, number, number, number];
  anchor: [number, number];
}
export interface PetClip { fps: number; frames: PetFrame[] }
export interface PetPack {
  version: 1;
  id: string;
  name: string;
  species: string;
  displayHeight: number;
  speed: number;
  textures: Record<string, { file: string; width: number; height: number }>;
  clips: Record<ClipName, PetClip>;
}

const fail = (reason: string): never => { throw new Error('宠物资源包：' + reason); };
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('需要 JSON 对象');
  return value as Record<string, unknown>;
}
function number(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return fail('数值超出允许范围');
  return value;
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) return fail('名称或标识不合法');
  return value.trim();
}
function tuple(value: unknown, count: number, min: number, max: number): number[] {
  if (!Array.isArray(value) || value.length !== count) return fail('坐标格式不正确');
  return value.map(v => number(v, min, max));
}

// Imported packs contain data and local raster filenames only; no URLs or executable plugins.
export function parsePetPack(value: unknown): PetPack {
  const input = object(value);
  if (input.version !== 1) return fail('不支持此版本');
  const id = text(input.id, 64);
  if (!/^[a-z][a-z0-9_-]*$/.test(id)) return fail('id 只允许小写字母、数字和短横线');
  const sources = Object.entries(object(input.textures));
  if (!sources.length || sources.length > 8) return fail('需要 1–8 张纹理');
  let totalPixels = 0;
  const textures: PetPack['textures'] = {};
  for (const [key, source] of sources) {
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(key)) return fail('纹理标识不合法');
    const t = object(source);
    const file = text(t.file, 100);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.(png|webp)$/.test(file)) return fail('图片必须是本地 PNG/WebP 文件名');
    const width = number(t.width, 1, 2048), height = number(t.height, 1, 2048);
    if (!Number.isInteger(width) || !Number.isInteger(height)) return fail('纹理尺寸必须是整数');
    totalPixels += width * height;
    textures[key] = { file, width, height };
  }
  if (totalPixels > 16_777_216) return fail('纹理像素总量过大');
  const clips = {} as PetPack['clips'];
  const rawClips = object(input.clips);
  for (const key of ['idle', 'walkLeft', 'walkRight'] as const) {
    const clip = object(rawClips[key]);
    if (!Array.isArray(clip.frames) || clip.frames.length < (key === 'idle' ? 1 : 4) || clip.frames.length > 32) return fail('待机至少 1 帧，左右行走各需 4–32 帧');
    const frames = clip.frames.map(raw => {
      const f = object(raw), texture = text(f.texture, 64);
      if (!Object.hasOwn(textures, texture)) return fail('动作引用了不存在的纹理');
      const rect = tuple(f.rect, 4, 0, 2048) as PetFrame['rect'];
      const bounds = tuple(f.bounds, 4, 0, 2048) as PetFrame['bounds'];
      const anchor = tuple(f.anchor, 2, 0, 1) as PetFrame['anchor'];
      const t = textures[texture];
      if (!rect.every(Number.isInteger) || rect[2] < 1 || rect[3] < 1 || rect[0] + rect[2] > t.width || rect[1] + rect[3] > t.height) return fail('帧超出纹理边界');
      if (bounds[2] < 1 || bounds[3] < 1 || bounds[0] + bounds[2] > rect[2] || bounds[1] + bounds[3] > rect[3]) return fail('可见范围超出动作帧');
      return { texture, rect, bounds, anchor };
    });
    if (key !== 'idle' && new Set(frames.map(f => f.texture + ':' + f.rect.join(','))).size < 4) return fail('行走需要至少四个独立动作帧');
    clips[key] = { fps: number(clip.fps, 1, 24), frames };
  }
  return { version: 1, id, name: text(input.name, 40), species: text(input.species, 40), displayHeight: number(input.displayHeight, 60, 200), speed: number(input.speed, 20, 120), textures, clips };
}

export interface Motion {
  position: Point;
  target: Point;
  facing: 'left' | 'right';
  moving: boolean;
  distance: number;
}
export const clampPoint = (p: Point, b: Bounds): Point => ({
  x: Math.max(b.left, Math.min(b.right, p.x)),
  y: Math.max(b.top, Math.min(b.bottom, p.y)),
});
export function advanceMotion(state: Motion, seconds: number, speed: number, bounds: Bounds): Motion {
  const position = clampPoint(state.position, bounds), target = clampPoint(state.target, bounds);
  const dx = target.x - position.x, dy = target.y - position.y, length = Math.hypot(dx, dy);
  const step = Math.min(length, speed * Math.max(0, Math.min(0.08, seconds)));
  const facing = Math.abs(dx) > 0.01 ? (dx < 0 ? 'left' : 'right') : state.facing;
  if (length < 0.1) return { ...state, position: target, target, facing, moving: false };
  return { position: { x: position.x + dx / length * step, y: position.y + dy / length * step }, target, facing, moving: step < length, distance: state.distance + step };
}
export function frameAt(clip: PetClip, seconds: number): PetFrame {
  return clip.frames[Math.floor(Math.max(0, seconds) * clip.fps) % clip.frames.length];
}

export function frameScale(pack: PetPack, frame: PetFrame): number {
  return Math.min(pack.displayHeight / frame.bounds[3], 240 / frame.bounds[2]);
}

// The movement point is the authored anchor, which may be far from the visible center.
// Fit the union of every registered frame, leaving room to move even for unusual pets.
export function petLayout(pack: PetPack, width: number, height: number): { scale: number; bounds: Bounds } {
  const edges = Object.values(pack.clips).flatMap(clip => clip.frames.map(frame => {
    const s = frameScale(pack, frame), [x, y, w, h] = frame.bounds;
    const ax = frame.anchor[0] * frame.rect[2], ay = frame.anchor[1] * frame.rect[3];
    return { left: (x - ax) * s, right: (x + w - ax) * s, top: (y - ay) * s, bottom: (y + h - ay) * s };
  }));
  const left = Math.min(0, ...edges.map(e => e.left)), right = Math.max(0, ...edges.map(e => e.right));
  const top = Math.min(0, ...edges.map(e => e.top)), bottom = Math.max(0, ...edges.map(e => e.bottom));
  const padding = 14, travelX = 48, travelY = 24;
  const scale = Math.min(1, (width - padding * 2 - travelX) / (right - left), (height - padding * 2 - travelY) / (bottom - top));
  const safeTop = padding - top * scale, safeBottom = height - padding - bottom * scale;
  const floorTop = Math.max(safeTop, Math.min(height * 0.83, safeBottom - travelY));
  return { scale, bounds: {
    left: padding - left * scale, right: width - padding - right * scale,
    top: floorTop, bottom: Math.min(safeBottom, Math.max(height * 0.94, floorTop + travelY)),
  } };
}

export function rasterSize(buffer: ArrayBuffer): [number, number] {
  const d = new DataView(buffer);
  if (d.byteLength < 30) return fail('图片文件头不完整');
  if (d.getUint32(0) === 0x89504e47 && d.getUint32(4) === 0x0d0a1a0a && d.getUint32(12) === 0x49484452) {
    return [d.getUint32(16), d.getUint32(20)];
  }
  if (d.getUint32(0) !== 0x52494646 || d.getUint32(8) !== 0x57454250) return fail('仅支持 PNG/WebP 图片');
  const kind = d.getUint32(12);
  if (kind === 0x56503858) {
    if (d.getUint8(20) & 2) return fail('需要静态动作图集，不支持动画 WebP');
    const uint24 = (at: number) => d.getUint8(at) + d.getUint8(at + 1) * 256 + d.getUint8(at + 2) * 65536;
    return [uint24(24) + 1, uint24(27) + 1];
  }
  if (kind === 0x5650384c && d.getUint8(20) === 0x2f) {
    const bits = d.getUint32(21, true);
    return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
  }
  if (kind === 0x56503820 && d.getUint8(23) === 0x9d && d.getUint8(24) === 1 && d.getUint8(25) === 0x2a) {
    return [d.getUint16(26, true) & 0x3fff, d.getUint16(28, true) & 0x3fff];
  }
  return fail('WebP 文件头无法读取');
}
