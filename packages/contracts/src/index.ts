/** Public wire types. The server validates input at runtime. */
export interface Credentials { email: string; password: string }
export interface RegisterRequest extends Credentials { username: string }
export interface SessionResponse {
  account: { id: string; email: string; username: string };
  expiresAt: string | null;
}
export interface AuthResponse extends SessionResponse {
  accessToken: string;
}
export interface ChangePasswordRequest { currentPassword: string; newPassword: string }
export interface ApiErrorResponse { code: string; message: string; requestId: string }
export type TripStatus = 'TRAVELING' | 'READY_TO_CLAIM' | 'CLAIMED';
export interface TripView {
  id: string;
  status: TripStatus;
  startedAt: string;
  returnAt: string;
  configVersion: string;
  destinationId: string;
}
export interface CollectionLine extends RewardLine { firstCollectedAt: string }
export interface PlayerSnapshot {
  player: { id: string; accountId: string; username: string };
  configVersion: string;
  pet: { id: string; speciesId: string; nickname: string; status: 'AT_HOME' | 'TRAVELING' };
  inventory: RewardLine[];
  // Fresh snapshots include this; frozen initialize receipts from the foundation version may omit it.
  collection?: CollectionLine[];
  revision: number;
  serverNow: string;
  activeTrip: TripView | null;
}
export interface StartTripRequest {
  loadoutItemIds: string[];
  expectedRevision: number;
}
export interface StartTripResponse { trip: TripView; snapshot: PlayerSnapshot }
export interface RewardLine { itemId: string; quantity: number }
export interface ClaimTripResponse {
  tripId: string;
  ledgerEntryId: string;
  rewards: RewardLine[];
  snapshot: PlayerSnapshot;
}
export const PET_ACTIVITIES = ['sleep', 'eat', 'drink', 'toilet', 'read', 'watch', 'sniff', 'rest', 'approach', 'retreat'] as const;
export type CatActivity = typeof PET_ACTIVITIES[number];
export const PET_SPOTS = ['sunny', 'shelter', 'food', 'water', 'toilet', 'reading', 'nearby'] as const;
export type CatSpot = typeof PET_SPOTS[number];
export type CatSurface = 'interior' | 'courtyard';
export interface CatIntent {
  id: string; activity: CatActivity; spot: CatSpot; surface: CatSurface;
  startedAt: string; durationSeconds: number;
  protocolVersion?: 2; stage?: 'moving' | 'using'; usingAt?: string;
}
export interface CatMemory {
  id: string; at: string; activity: CatActivity; spot: CatSpot;
  kind: 'observed' | 'away'; text: string;
}
export interface CatLifeView {
  petId: string; revision: number; serverNow: string;
  temperament: { curiosity: number; sociability: number; sensitivity: number };
  needs: { hunger: number; fatigue: number; stimulation: number; alertness: number };
  preferences: Record<'sunny' | 'shelter' | 'food' | 'nearby', number> & Partial<Record<CatSpot, number>>;
  cushion: 'sunny' | 'shelter'; automatic: boolean; intent: CatIntent | null; memories: CatMemory[];
  decisionSource: 'jev' | 'rules' | 'continuity';
  version?: 2;
  body?: PetBody;
  mood?: PetMood;
  facilities?: PetFacilities;
  profile?: PetProfileView;
  activities?: PetActivityView[];
}
export interface CatLifeRequest {
  surface: CatSurface; event: 'observe' | 'started' | 'arrived' | 'complete' | 'blocked' | 'stroke' | 'invite' | 'move_cushion';
  automatic: boolean;
  intentId: string | null; expectedRevision: number; target: 'sunny' | 'shelter' | null;
  invitedActivity?: CatActivity;
  protocolVersion?: 2;
}
export interface PetBody { thirst: number; bowel: number; cleanliness: number }
export interface PetMood { label: 'relaxed' | 'curious' | 'happy' | 'sleepy' | 'uneasy'; pleasure: number; energy: number; safety: number }
export interface PetFacilities {
  food: { portions: number; reservedBy: string | null };
  water: { portions: number; reservedBy: string | null };
  toilet: { cleanliness: number; uses: number };
  reading: { bookId: string; sessions: number };
}
export interface PetActivityView { id: CatActivity; label: string; spot: CatSpot; available: boolean; reason: string | null }
export interface PetProfileView {
  petId: string; revision: number; nickname: string; speciesId: string; description: string;
  voice: 'gentle' | 'playful' | 'quiet';
  temperament: { curiosity: number; sociability: number; sensitivity: number };
  updatedAt: string;
}
export interface PetProfileRequest {
  expectedRevision: number; nickname: string; description: string; voice: PetProfileView['voice'];
  temperament: PetProfileView['temperament'];
}
export interface PetCareRequest {
  operation: 'feed' | 'refill_water' | 'clean_toilet';
  source: 'basic' | 'inventory'; expectedRevision: number;
}
export interface PetCareResult { life: CatLifeView; snapshot: PlayerSnapshot }
export type ChatTurnStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export interface PetInvitation {
  activity: CatActivity;
  outcome: 'accepted' | 'declined' | 'deferred' | 'unavailable';
  stage: 'requested' | 'started' | 'completed' | 'blocked';
  intentId: string | null;
  life: CatLifeView | null;
}
export interface ChatTurnView {
  id: string; userText: string; reply: string; status: ChatTurnStatus; createdAt: string;
  error: string | null; invitation: PetInvitation | null; memoryStatus: 'pending' | 'ready' | 'unavailable';
  images?: MediaView[];
  imageJob?: ImageJobView | null;
}
export interface ChatEventView { id: number; type: 'status' | 'text' | 'tool' | 'memory' | 'image'; data: Record<string, unknown> }
export interface ChatHistory { petId: string; turns: ChatTurnView[]; before: string | null; chatEnabled: boolean; speechEnabled: boolean; imageEnabled?: boolean }
export interface ChatEvents { turn: ChatTurnView; events: ChatEventView[]; cursor: number }
export interface PetMemoryView { id: string; text: string; sourceTurnId: string | null; updatedAt: string }
export interface PetMemories { items: PetMemoryView[]; status: 'ready' | 'unavailable' | 'pending' }
export interface SpeechJobView { id: string; status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'; text: string; error: string | null }
export interface MediaView { id: string; width: number; height: number; kind: 'upload' | 'chat' | 'postcard' }
export type ImageJobStatus = 'proposed' | 'queued' | 'submitted' | 'saving' | 'completed' | 'failed' | 'unknown' | 'cancelled' | 'fallback';
export interface ImageJobView {
  id: string; origin: 'request' | 'proposal' | 'gift' | 'postcard'; status: ImageJobStatus;
  prompt: string; image: MediaView | null; error: string | null; attempt: number; referenceIds?: string[];
}
export interface PostcardView {
  tripId: string; destinationId: string; theme: string; createdAt: string; claimed: boolean;
  job: ImageJobView;
}
export interface Postcards { items: PostcardView[]; before: string | null }
export interface ImageBudgetView { limitFen: number; usedFen: number; resetsAt: string; enabled: boolean }
// Mutating requests require an Idempotency-Key header.
// The authenticated identity comes from the session, never a body-supplied playerId.
