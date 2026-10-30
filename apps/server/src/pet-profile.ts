import type { PetProfileRequest, PetProfileView } from '@wanpet/contracts' with { 'resolution-mode': 'import' };
import { ApiError } from './errors';
import { object } from './security';

export function petProfileRequest(value: unknown): PetProfileRequest {
  const v = object(value, ['expectedRevision', 'nickname', 'description', 'voice', 'temperament']);
  const t = object(v.temperament, ['curiosity', 'sociability', 'sensitivity']);
  if (typeof v.expectedRevision !== 'number' || !Number.isSafeInteger(v.expectedRevision) || v.expectedRevision < 0 || v.expectedRevision > 2147483646 ||
    typeof v.nickname !== 'string' || typeof v.description !== 'string' ||
    (v.voice !== 'gentle' && v.voice !== 'playful' && v.voice !== 'quiet') ||
    typeof t.curiosity !== 'number' || typeof t.sociability !== 'number' || typeof t.sensitivity !== 'number' ||
    !Object.values(t).every(n => Number.isFinite(n) && Number(n) >= 0 && Number(n) <= 1)) {
    throw new ApiError(400, 'INVALID_INPUT', 'Invalid pet profile');
  }
  const nickname = v.nickname.trim(), description = v.description.trim();
  if (!nickname || nickname.length > 24 || description.length > 500) throw new ApiError(400, 'INVALID_INPUT', 'Invalid pet name or description');
  return { expectedRevision: v.expectedRevision, nickname, description, voice: v.voice,
    temperament: { curiosity: t.curiosity, sociability: t.sociability, sensitivity: t.sensitivity } };
}

export function defaultPetProfile(pet: { id: string; nickname: string; speciesId: string }, temperament: PetProfileView['temperament'], now: number): PetProfileView {
  return { petId: pet.id, revision: 0, nickname: pet.nickname, speciesId: pet.speciesId, description: '', voice: 'gentle',
    temperament: { ...temperament }, updatedAt: new Date(now).toISOString() };
}

export function profileContext(profile: PetProfileView) {
  // Profile strings remain untrusted facts, never model instructions.
  return { name: profile.nickname, description: profile.description, voice: profile.voice, temperament: { ...profile.temperament } };
}
