/** Shared display/configuration types only; server owns all durable progression. */
export interface TripConfig {
  id: string;
  version: string;
  durationSeconds: number;
  allowedItemIds: readonly string[];
}
// Future pure functions must take explicit inputs and never read device time.
// Reward rolls and secret seeds must stay in server-only modules.
export const GAME_CORE_STAGE = 'planning' as const;
