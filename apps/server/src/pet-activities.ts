import type { CatActivity, CatSpot, PetActivityView } from '@wanpet/contracts' with { 'resolution-mode': 'import' };

export const ACTIVITIES: Record<CatActivity, { label: string; spot: CatSpot; seconds: number; description: string }> = {
  sleep: { label: '睡觉', spot: 'shelter', seconds: 90, description: 'Sleep in a familiar comfortable place when tired.' },
  eat: { label: '吃饭', spot: 'food', seconds: 35, description: 'Eat one available portion from the food bowl.' },
  drink: { label: '喝水', spot: 'water', seconds: 20, description: 'Drink available water from the water bowl.' },
  toilet: { label: '上厕所', spot: 'toilet', seconds: 25, description: 'Use the litter box privately when needing the toilet.' },
  read: { label: '看书', spot: 'reading', seconds: 45, description: 'Look through an open picture book with quiet curiosity.' },
  watch: { label: '张望', spot: 'sunny', seconds: 45, description: 'Watch the window or garden quietly.' },
  sniff: { label: '探索', spot: 'sunny', seconds: 25, description: 'Investigate a familiar spot or moved cushion.' },
  rest: { label: '休息', spot: 'shelter', seconds: 65, description: 'Rest comfortably without sleeping.' },
  approach: { label: '靠近', spot: 'nearby', seconds: 35, description: 'Approach the person calmly.' },
  retreat: { label: '独处', spot: 'shelter', seconds: 50, description: 'Recover quietly after too much handling.' },
};
export function activityViews(available: (activity: CatActivity) => string | null): PetActivityView[] {
  return (Object.entries(ACTIVITIES) as [CatActivity, typeof ACTIVITIES[CatActivity]][]).map(([id, spec]) => {
    const reason = available(id);
    return { id, label: spec.label, spot: spec.spot, available: reason === null, reason };
  });
}
