import { parsePetPack, rasterSize, type PetPack } from './model';
import calicoData from '../../../../assets/pets/calico-v1/pet.json';
import idleUrl from '../../../../assets/pets/calico-v1/idle.webp?url';
import leftUrl from '../../../../assets/pets/calico-v1/walk-left.webp?url';
import rightUrl from '../../../../assets/pets/calico-v1/walk-right.webp?url';

export interface LoadedPet { pack: PetPack; images: Record<string, HTMLImageElement>; dispose: () => void }
export async function loadPet(pack: PetPack, urls: Record<string, string>): Promise<LoadedPet> {
  const entries = await Promise.all(Object.entries(pack.textures).map(async ([id, t]) => {
    const image = new Image();
    if (!urls[t.file]) throw new Error('缺少宠物图片：' + t.file);
    image.src = urls[t.file];
    try { await image.decode(); } catch { throw new Error('图片无法读取：' + t.file); }
    if (image.naturalWidth !== t.width || image.naturalHeight !== t.height) throw new Error('图片实际尺寸与动作文件不一致：' + t.file);
    const sample = document.createElement('canvas');
    sample.width = sample.height = 64;
    const context = sample.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('当前设备无法检查宠物图片');
    context.drawImage(image, 0, 0, 64, 64);
    const pixels = context.getImageData(0, 0, 64, 64).data;
    let transparent = false, visible = false;
    for (let i = 3; i < pixels.length; i += 4) {
      transparent ||= pixels[i] < 16;
      visible ||= pixels[i] > 128;
    }
    if (!transparent || !visible) throw new Error('宠物图片需要透明背景和可见角色：' + t.file);
    return [id, image] as const;
  }));
  return { pack, images: Object.fromEntries(entries), dispose() {} };
}
export const loadCalico = () => loadPet(parsePetPack(calicoData), { 'idle.webp': idleUrl, 'walk-left.webp': leftUrl, 'walk-right.webp': rightUrl });

export async function importPet(files: FileList | File[]): Promise<LoadedPet> {
  const all = Array.from(files);
  const list = all.filter(file => !/\.(png|webp)\.json$/.test(file.name));
  if (all.length > 17 || list.length > 9 || all.reduce((sum, file) => sum + file.size, 0) > 24 * 1024 * 1024) throw new Error('资源包最多 8 张图片与一份动作 JSON、总计 24MB');
  if (new Set(list.map(f => f.name)).size !== list.length) throw new Error('文件名不能重复');
  const json = list.filter(f => f.name.endsWith('.json'));
  if (json.length !== 1 || json[0].size > 128 * 1024) throw new Error('请同时选择一份动作 JSON 和配套 PNG/WebP 图片');
  let pack: PetPack;
  try { pack = parsePetPack(JSON.parse(await json[0].text())); } catch (error) {
    throw new Error(error instanceof SyntaxError ? '动作 JSON 无法读取，请检查文件格式' : (error as Error).message);
  }
  const urls: Record<string, string> = {};
  const dispose = () => Object.values(urls).forEach(url => URL.revokeObjectURL(url));
  try {
    for (const t of Object.values(pack.textures)) {
      const file = list.find(f => f.name === t.file);
      if (!file || file.size > 12 * 1024 * 1024) throw new Error('缺少图片或单图超过 12MB：' + t.file);
      const [width, height] = rasterSize(await file.slice(0, 32).arrayBuffer());
      if (width !== t.width || height !== t.height) throw new Error('图片尺寸与动作文件不一致：' + t.file);
      urls[t.file] = URL.createObjectURL(file);
    }
    const pet = await loadPet(pack, urls);
    return { ...pet, dispose };
  } catch (error) { dispose(); throw error; }
}
