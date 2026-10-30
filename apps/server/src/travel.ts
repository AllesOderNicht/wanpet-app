import { randomInt } from 'node:crypto';
import type { StartTripRequest, TripView } from '@wanpet/contracts' with { 'resolution-mode': 'import' };
import { ApiError } from './errors';
import { object } from './security';

// Versioned test rules, separate from approved art and future live game balancing.
export const TEST_TRIP = {
  version: 'test-trip-v1', destinationId: 'test_forest', durationSeconds: 60,
  allowedItemIds: ['test_food', 'test_supply'],
  postcards: ['test_postcard_forest', 'test_postcard_stream', 'test_postcard_meadow'],
} as const;

export function startTripRequest(input: unknown): StartTripRequest {
  const body = object(input, ['loadoutItemIds', 'expectedRevision']);
  const ids = body.loadoutItemIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 3 ||
      ids.some(id => typeof id !== 'string' || !TEST_TRIP.allowedItemIds.some(allowed => allowed === id)) || new Set(ids).size !== ids.length) {
    throw new ApiError(400, 'INVALID_LOADOUT', 'Select 1–3 distinct supported test items');
  }
  const revision = body.expectedRevision;
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1 || revision > 2147483647) {
    throw new ApiError(400, 'INVALID_INPUT', 'Expected revision must be a positive integer');
  }
  return { loadoutItemIds: [...ids].sort(), expectedRevision: revision };
}

export function tripId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) {
    throw new ApiError(400, 'INVALID_INPUT', 'Invalid trip ID');
  }
  return value.toLowerCase();
}

// Roll once at departure and store the result; retries/claims never roll again.
type TripReward = { itemId: string; quantity: number; collectible: boolean };
export function rollTripRewards(): TripReward[] {
  return [{ itemId: 'test_food', quantity: 1, collectible: false }, { itemId: TEST_TRIP.postcards[randomInt(TEST_TRIP.postcards.length)]!, quantity: 1, collectible: true }];
}

// Read stored rewards rather than current rules, so a config change cannot alter an existing trip.
export function storedRewards(value: unknown): TripReward[] {
  if (!Array.isArray(value) || !value.length || value.length > 16) throw new Error('Invalid stored trip rewards');
  const ids = new Set<string>();
  return value.map(raw => {
    if (!raw || typeof raw !== 'object' || typeof raw.itemId !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(raw.itemId) ||
        !Number.isInteger(raw.quantity) || raw.quantity < 1 || raw.quantity > 1000 || typeof raw.collectible !== 'boolean' || ids.has(raw.itemId)) {
      throw new Error('Invalid stored trip reward line');
    }
    ids.add(raw.itemId);
    return { itemId: raw.itemId, quantity: raw.quantity, collectible: raw.collectible };
  });
}

export function tripView(trip: { id: string; configVersion: string; destinationId: string; startedAt: Date; returnAt: Date; claimedAt: Date | null }, now: Date): TripView {
  return { id: trip.id, configVersion: trip.configVersion, destinationId: trip.destinationId,
    startedAt: trip.startedAt.toISOString(), returnAt: trip.returnAt.toISOString(),
    status: trip.claimedAt ? 'CLAIMED' : trip.returnAt <= now ? 'READY_TO_CLAIM' : 'TRAVELING' };
}
