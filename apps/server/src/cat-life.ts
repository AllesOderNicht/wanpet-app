import { randomUUID } from 'node:crypto';
import type { CatActivity, CatLifeRequest, CatLifeView, CatMemory, CatSpot, PetBody, PetCareRequest, PetFacilities, PetMood } from '@wanpet/contracts' with { 'resolution-mode': 'import' };
import { ApiError } from './errors';
import { digest, object } from './security';
import { ACTIVITIES, activityViews } from './pet-activities';

export interface CatState extends Omit<CatLifeView, 'petId' | 'revision' | 'serverNow' | 'profile' | 'activities'> {
  version: 2; updatedAt: number; lastTouchAt: number; touches: number;
  body: PetBody; facilities: PetFacilities; mood: PetMood;
  invitation: { spot: 'sunny' | 'shelter'; until: number; activity?: CatActivity } | null;
}
export interface CatOption { activity: CatActivity; spot: CatSpot; description: string; score: number }
const clamp = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 1000000) / 1000000;
const isRevision = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 2147483646;
const legacyActivities = ['sleep', 'eat', 'watch', 'sniff', 'rest', 'approach', 'retreat'];
export function catLifeRequest(value: unknown): CatLifeRequest {
  const fields = ['surface', 'event', 'automatic', 'intentId', 'expectedRevision', 'target'];
  for (const field of ['invitedActivity', 'protocolVersion']) if (value && typeof value === 'object' && Object.hasOwn(value, field)) fields.push(field);
  const v = object(value, fields);
  if (typeof v.surface !== 'string' || typeof v.event !== 'string' || !['interior', 'courtyard'].includes(v.surface) ||
    !['observe', 'started', 'arrived', 'complete', 'blocked', 'stroke', 'invite', 'move_cushion'].includes(String(v.event)) ||
    (v.protocolVersion !== undefined && v.protocolVersion !== 2) || (v.event === 'arrived' && v.protocolVersion !== 2) ||
    (v.invitedActivity !== undefined && (typeof v.invitedActivity !== 'string' || v.event !== 'invite' || !Object.hasOwn(ACTIVITIES, v.invitedActivity) || (v.protocolVersion !== 2 && !legacyActivities.includes(v.invitedActivity)))) ||
    typeof v.automatic !== 'boolean' || !isRevision(v.expectedRevision) ||
    (v.intentId !== null && (typeof v.intentId !== 'string' || !/^[a-f0-9-]{36}$/.test(v.intentId))) ||
    ![null, 'sunny', 'shelter'].includes(v.target as null) ||
    (['started', 'arrived', 'complete', 'blocked'].includes(String(v.event)) && v.intentId === null) ||
    (['move_cushion', 'invite'].includes(String(v.event)) ? v.target === null : v.target !== null)) throw new ApiError(400, 'INVALID_INPUT', 'Invalid pet life event');
  return v as unknown as CatLifeRequest;
}
export function petCareRequest(value: unknown): PetCareRequest {
  const v = object(value, ['operation', 'source', 'expectedRevision']);
  if (typeof v.operation !== 'string' || typeof v.source !== 'string' || !['feed', 'refill_water', 'clean_toilet'].includes(v.operation) || !['basic', 'inventory'].includes(v.source) ||
      (v.operation !== 'feed' && v.source !== 'basic') || !isRevision(v.expectedRevision)) throw new ApiError(400, 'INVALID_INPUT', 'Invalid care command');
  return v as unknown as PetCareRequest;
}
export function petMood(state: Pick<CatState, 'needs' | 'body'>): PetMood {
  const energy = clamp(1 - state.needs.fatigue), safety = clamp(1 - state.needs.alertness);
  const pleasure = clamp(0.85 - state.needs.hunger * 0.22 - state.body.thirst * 0.15 - state.body.bowel * 0.2 - (1 - state.body.cleanliness) * 0.15 - state.needs.alertness * 0.2);
  const label = safety < 0.4 || pleasure < 0.35 ? 'uneasy' : energy < 0.3 ? 'sleepy' : state.needs.stimulation > 0.6 ? 'curious' : pleasure > 0.7 ? 'happy' : 'relaxed';
  return { label, pleasure, energy, safety };
}
export function initialCat(petId: string, now: number): CatState {
  const seed = digest(petId), trait = (offset: number) => clamp(0.25 + parseInt(seed.slice(offset, offset + 2), 16) / 510);
  const state: CatState = { version: 2, updatedAt: now, lastTouchAt: 0, touches: 0, automatic: true, invitation: null,
    temperament: { curiosity: trait(0), sociability: trait(2), sensitivity: trait(4) },
    needs: { hunger: 0.28, fatigue: 0.35, stimulation: 0.45, alertness: 0.1 },
    body: { thirst: 0.2, bowel: 0.1, cleanliness: 0.95 },
    facilities: { food: { portions: 3, reservedBy: null }, water: { portions: 3, reservedBy: null }, toilet: { cleanliness: 1, uses: 0 }, reading: { bookId: 'garden-stories-v1', sessions: 0 } },
    preferences: { sunny: trait(6), shelter: trait(8), food: 0.35, nearby: trait(10), water: 0.35, toilet: 0.35, reading: trait(12) },
    cushion: 'shelter', intent: null, memories: [], decisionSource: 'rules', mood: { label: 'relaxed', pleasure: 0.7, energy: 0.65, safety: 0.9 } };
  state.mood = petMood(state); return state;
}
export function migrateCat(value: unknown, petId: string, now: number): CatState {
  if (!value || typeof value !== 'object' || ![1, 2].includes(Number((value as { version?: number }).version))) throw new Error('Unsupported pet life save');
  const old = structuredClone(value) as CatState, initial = initialCat(petId, now);
  const state = { ...initial, ...old, version: 2 as const, body: { ...initial.body, ...old.body }, facilities: { ...initial.facilities, ...old.facilities }, preferences: { ...initial.preferences, ...old.preferences } };
  state.mood = petMood(state); return state;
}
const spotText: Record<CatSpot, string> = { sunny: '窗边', shelter: '安静的角落', food: '食盆旁', water: '水碗旁', toilet: '猫砂盆里', reading: '绘本旁', nearby: '你身边' };
function remember(state: CatState, activity: CatActivity, spot: CatSpot, now: number, kind: CatMemory['kind']) {
  const verbs: Record<CatActivity, string> = { sleep: '睡了一会儿', eat: '吃好了一餐', drink: '喝了些水', toilet: '用过了猫砂盆', read: '看了一会儿花园绘本', watch: '安静地张望', sniff: '探索了一会儿', rest: '舒服地休息', approach: '陪了一会儿', retreat: '独自放松了一会儿' };
  state.memories.unshift({ id: randomUUID(), at: new Date(now).toISOString(), activity, spot, kind, text: `${kind === 'away' ? '离开期间，' : ''}它在${spotText[spot]}${verbs[activity]}。` });
  state.memories = state.memories.slice(0, 16);
}
export function interruptCatIntent(state: CatState, now: number): void {
  const intent = state.intent;
  if (intent?.protocolVersion === 2 && intent.stage === 'using' && intent.usingAt && ['eat', 'drink'].includes(intent.activity)) {
    const fraction = Math.min(1, Math.max(0, now - Date.parse(intent.usingAt)) / (intent.durationSeconds * 1000));
    // The portion was consumed on arrival; credit its used share once without claiming completion.
    satisfy(state, intent.activity, intent.spot, fraction);
  }
  releaseIntent(state);
}
function releaseIntent(state: CatState) {
  for (const bowl of [state.facilities.food, state.facilities.water]) if (bowl.reservedBy === state.intent?.id) bowl.reservedBy = null;
  state.intent = null;
}
export function activityUnavailable(state: CatState, activity: CatActivity): string | null {
  if (activity === 'eat' && state.facilities.food.portions < 1) return '食盆空了，先补一点食物';
  if (activity === 'drink' && state.facilities.water.portions < 1) return '水碗空了，先添一点水';
  if (activity === 'toilet' && state.facilities.toilet.cleanliness < 0.15) return '先清理一下猫砂盆';
  return null;
}
function satisfy(state: CatState, activity: CatActivity, spot: CatSpot, fraction = 1) {
  const n = state.needs;
  if (activity === 'eat') { n.hunger = clamp(n.hunger - 0.55 * fraction); state.body.bowel = clamp(state.body.bowel + 0.32 * fraction); }
  if (activity === 'drink') state.body.thirst = clamp(state.body.thirst - 0.65 * fraction);
  if (activity === 'toilet') { state.body.bowel = 0.05; state.facilities.toilet.cleanliness = clamp(state.facilities.toilet.cleanliness - 0.28); state.facilities.toilet.uses++; }
  if (activity === 'read') { n.stimulation = clamp(n.stimulation - 0.4); state.facilities.reading.sessions++; }
  if (activity === 'sleep') n.fatigue = clamp(n.fatigue - 0.55);
  if (activity === 'rest') n.fatigue = clamp(n.fatigue - 0.15);
  if (['watch', 'sniff'].includes(activity)) n.stimulation = clamp(n.stimulation - 0.28);
  if (activity === 'retreat') n.alertness = clamp(n.alertness - 0.5);
  if (['sleep', 'rest', 'watch', 'read'].includes(activity)) state.preferences[spot] = clamp((state.preferences[spot] ?? 0.35) + 0.015);
}
function consume(state: CatState, activity: CatActivity): boolean {
  const bowl = activity === 'eat' ? state.facilities.food : activity === 'drink' ? state.facilities.water : null;
  if (!bowl) return true;
  if (bowl.portions < 1) return false;
  bowl.portions--; bowl.reservedBy = null; return true;
}
export function advanceCat(previous: CatState, input: CatLifeRequest, now: number, atHomeSince: number): CatState {
  const state = structuredClone(previous);
  if (now - state.lastTouchAt > 30000) state.touches = 0;
  if (!state.invitation || state.invitation.until < now) state.invitation = null;
  const elapsed = Math.max(0, now - Math.max(state.updatedAt, atHomeSince)), hours = Math.min(elapsed / 3600000, 8);
  state.needs.hunger = clamp(state.needs.hunger + hours * 0.14);
  state.needs.fatigue = clamp(state.needs.fatigue + hours * 0.12);
  state.needs.stimulation = clamp(state.needs.stimulation + hours * 0.1);
  state.needs.alertness = clamp(state.needs.alertness - hours * 0.6);
  state.body.thirst = clamp(state.body.thirst + hours * 0.1);
  state.body.bowel = clamp(state.body.bowel + hours * 0.07);
  state.body.cleanliness = clamp(state.body.cleanliness - hours * 0.025);
  if (state.intent && (state.intent.surface !== input.surface || Date.parse(state.intent.startedAt) < atHomeSince || now - Date.parse(state.intent.startedAt) > (state.intent.durationSeconds + 120) * 1000)) interruptCatIntent(state, now);
  if (state.automatic && elapsed >= 300000) {
    interruptCatIntent(state, now);
    const count = Math.min(3, Math.floor(elapsed / 300000));
    for (let i = 0; i < count; i++) {
      const activity: CatActivity = state.needs.hunger > 0.65 ? 'eat' : state.needs.fatigue > 0.5 ? 'sleep' : state.body.bowel > 0.7 ? 'toilet' : state.body.thirst > 0.7 ? 'drink' : 'rest';
      const spot = ['eat', 'drink', 'toilet'].includes(activity) ? ACTIVITIES[activity].spot : state.preferences.sunny > state.preferences.shelter ? 'sunny' : 'shelter';
      // Basic away care affects facilities only, never the player's inventory or rewards.
      if (activity === 'eat' && state.facilities.food.portions === 0) state.facilities.food.portions = 1;
      if (activity === 'drink' && state.facilities.water.portions === 0) state.facilities.water.portions = 1;
      if (activity === 'toilet' && state.facilities.toilet.cleanliness < 0.15) state.facilities.toilet.cleanliness = 1;
      consume(state, activity); satisfy(state, activity, spot); remember(state, activity, spot, now - (count - i) * 60000, 'away');
    }
  }
  const active = state.intent;
  if (active && input.intentId === active.id) {
    if (input.event === 'arrived' && active.protocolVersion === 2 && active.stage === 'moving' && now >= Date.parse(active.startedAt) + 300) {
      if (activityUnavailable(state, active.activity) || !consume(state, active.activity)) releaseIntent(state);
      else { active.stage = 'using'; active.usingAt = new Date(now).toISOString(); }
    }
    const ready = active.protocolVersion === 2 ? active.stage === 'using' && !!active.usingAt && now >= Date.parse(active.usingAt) + active.durationSeconds * 1000 : now >= Date.parse(active.startedAt) + active.durationSeconds * 1000;
    if (input.event === 'complete' && ready && state.intent) {
      if (active.protocolVersion === 2 || consume(state, active.activity)) { satisfy(state, active.activity, active.spot); remember(state, active.activity, active.spot, now, 'observed'); }
      releaseIntent(state);
    }
    if (input.event === 'blocked') interruptCatIntent(state, now);
  }
  if (input.event === 'stroke') {
    state.touches = now - state.lastTouchAt < 30000 ? state.touches + 1 : 1; state.lastTouchAt = now;
    state.needs.alertness = clamp(state.needs.alertness + state.temperament.sensitivity * (state.touches > 2 ? 0.45 : 0.06));
    if (state.needs.alertness > 0.65 || (state.intent?.activity !== 'sleep' && now - Date.parse(state.intent?.startedAt ?? '') > 15000)) interruptCatIntent(state, now);
  }
  if (input.event === 'invite') {
    state.invitation = { spot: input.target!, until: now + 120000, ...(input.invitedActivity ? { activity: input.invitedActivity } : {}) };
    if (state.intent && !['sleep', 'eat', 'drink', 'toilet'].includes(state.intent.activity) && now - Date.parse(state.intent.startedAt) >= 15000 && state.temperament.curiosity > 0.5) interruptCatIntent(state, now);
  }
  if (input.event === 'move_cushion' && input.target !== state.cushion) {
    state.cushion = input.target!; state.needs.stimulation = clamp(state.needs.stimulation + 0.2);
    if (!state.intent || !['sleep', 'eat', 'drink', 'toilet'].includes(state.intent.activity)) interruptCatIntent(state, now);
  }
  const pausing = state.automatic && !input.automatic;
  state.automatic = input.automatic;
  if (pausing && !['stroke', 'invite', 'started', 'arrived', 'complete'].includes(input.event)) interruptCatIntent(state, now);
  state.updatedAt = now; state.mood = petMood(state); return state;
}
export function applyCare(previous: CatState, input: PetCareRequest): CatState {
  const state = structuredClone(previous);
  if (input.operation === 'feed') {
    if (state.facilities.food.portions >= 3) throw new ApiError(409, 'BOWL_FULL', 'The food bowl is full');
    state.facilities.food.portions++;
  } else if (input.operation === 'refill_water') {
    if (state.facilities.water.portions >= 3) throw new ApiError(409, 'BOWL_FULL', 'The water bowl is full');
    state.facilities.water.portions = 3;
  } else {
    if (state.intent?.activity === 'toilet') throw new ApiError(409, 'FACILITY_BUSY', 'Wait until the pet leaves the toilet');
    state.facilities.toilet = { cleanliness: 1, uses: 0 }; state.body.cleanliness = clamp(state.body.cleanliness + 0.2);
  }
  state.mood = petMood(state); return state;
}
export function catOptions(state: CatState, input: CatLifeRequest, now: number): Record<string, CatOption> {
  if (state.intent || (!state.automatic && !['stroke', 'invite'].includes(input.event))) return {};
  const n = state.needs, p = state.temperament, hour = new Date(now + 8 * 3600000).getUTCHours(), quiet = hour >= 22 || hour < 6;
  const entries: Array<[CatActivity, CatSpot, number]> = [
    ...(['sunny', 'shelter'] as const).map(spot => ['sleep', spot, n.fatigue * 1.3 + (quiet ? 0.2 : 0) + (state.cushion === spot ? 0.06 : 0)] as [CatActivity, CatSpot, number]),
    ['eat', 'food', n.hunger * 1.35], ['drink', 'water', state.body.thirst * 1.3], ['toilet', 'toilet', state.body.bowel * 1.5],
    ['read', 'reading', n.stimulation * 0.6 + p.curiosity * 0.35], ['watch', 'sunny', n.stimulation * 0.7 + p.curiosity * 0.2],
    ['sniff', state.cushion, n.stimulation * p.curiosity + (input.event === 'move_cushion' ? 0.4 : 0)],
    ...(['sunny', 'shelter'] as const).map(spot => ['rest', spot, n.fatigue * 0.5 + 0.2] as [CatActivity, CatSpot, number]),
    ['approach', 'nearby', p.sociability * 0.4 + (input.event === 'stroke' ? 0.35 : 0)], ['retreat', 'shelter', n.alertness * 1.3],
  ];
  if (state.invitation) entries.push(['sniff', state.invitation.spot, p.curiosity * 0.5 + 0.2]);
  return Object.fromEntries(entries.filter(([activity]) => {
    if ((input.protocolVersion !== 2 && !legacyActivities.includes(activity)) || activityUnavailable(state, activity)) return false;
    if (n.alertness > 0.8) return activity === 'retreat';
    if (n.hunger > 0.9 && !activityUnavailable(state, 'eat')) return activity === 'eat';
    if (input.protocolVersion === 2 && state.body.bowel > 0.9 && !activityUnavailable(state, 'toilet')) return activity === 'toilet';
    return n.fatigue > 0.9 ? ['sleep', 'rest'].includes(activity) : true;
  }).map(([activity, spot, score]) => [`${activity}_${spot}`, { activity, spot, description: ACTIVITIES[activity].description + ` Place: ${spot}.`,
    score: score + (state.preferences[spot] ?? 0.35) * 0.12 + (state.invitation?.activity === activity ? 0.5 : 0) - (state.memories[0]?.activity === activity ? 0.2 : 0) }]));
}
export function chooseCat(state: CatState, input: CatLifeRequest, now: number, selection?: string): void {
  const options = catOptions(state, input, now), fallback = Object.entries(options).sort((a, b) => b[1].score - a[1].score)[0];
  if (!fallback) { state.decisionSource = 'continuity'; return; }
  const option = selection && options[selection] ? options[selection]! : fallback[1];
  state.intent = { id: randomUUID(), activity: option.activity, spot: option.spot, surface: input.surface, startedAt: new Date(now).toISOString(), durationSeconds: ACTIVITIES[option.activity].seconds,
    ...(input.protocolVersion === 2 ? { protocolVersion: 2 as const, stage: 'moving' as const } : {}) };
  if (option.activity === 'eat') state.facilities.food.reservedBy = state.intent.id;
  if (option.activity === 'drink') state.facilities.water.reservedBy = state.intent.id;
  state.decisionSource = selection && options[selection] ? 'jev' : 'rules';
}
export function catView(petId: string, revision: number, state: CatState, now: number): CatLifeView {
  const { updatedAt: _u, lastTouchAt: _l, touches: _t, invitation: _i, ...view } = state;
  return { ...view, petId, revision, serverNow: new Date(now).toISOString(), mood: petMood(state), activities: activityViews(activity => activityUnavailable(state, activity)) };
}
