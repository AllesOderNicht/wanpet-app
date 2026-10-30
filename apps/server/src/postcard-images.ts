import { randomInt } from 'node:crypto';
import type { Transaction } from './database';
export const POSTCARD_STYLE = 'watercolor-calico-v1';
// The currently shipped test species is rendered with the approved calico pack.
export function appearanceFor(speciesId: string) { return speciesId === 'test_species' ? 'calico-v1' : 'species:' + speciesId; }
export async function planPostcard(tx: Transaction, input: { tripId: string; accountId: string; petId: string; speciesId: string; destination: string; theme: string }, roll = randomInt(100), generationEnabled = true) {
  const appearance = appearanceFor(input.speciesId);
  const fresh = roll < 10 && generationEnabled;
  const image = fresh ? null : await tx.mediaAsset.findFirst({ where: { kind: 'postcard', deletedAt: null, destination: input.destination, appearance, theme: input.theme, style: POSTCARD_STYLE }, orderBy: { createdAt: 'desc' } });
  const scenery = input.theme === 'test_postcard_stream' ? '林间溪流' : input.theme === 'test_postcard_meadow' ? '森林边的草地' : '森林小径';
  return tx.imageJob.create({ data: { accountId: input.accountId, petId: input.petId, tripId: input.tripId, origin: 'postcard',
    destination: input.destination, theme: input.theme, appearance, style: POSTCARD_STYLE,
    status: fresh ? 'queued' : image ? 'completed' : 'fallback', imageId: image?.id,
    prompt: `原创清透水彩绘本旅行明信片，参考图中的同一只三花猫在${scenery}中。保持猫的毛色、花纹与身体比例，真实猫姿态。温柔自然光，画面留白，无文字、无人名、无标志。仅描绘目的地风景，不添加未经确认的事件。` } });
}
