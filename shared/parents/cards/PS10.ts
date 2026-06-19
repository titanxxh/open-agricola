import type { FatherCardDefinition } from '../types'

export const PS10 = {
  id: 'PS10',
  kind: 'father',
  conditionText: 'If you have built at least 6/9/12 fences, you can turn this card face down.',
  text: 'If you have built at least 6/9/12 fences, you can turn this card face down. If you do, you immediately get 1/2/3 wild boar.',
  assets: { front: 'PS10.png', back: 'father' },
  rewards: [
    {
      tier: 1,
      requirementText: '6 built fences',
      requirement: { type: 'farm-count-at-least', target: 'fence', amount: 6 },
      rewardText: 'If you do, you immediately get 1 wild boar.',
      effects: [{ type: 'gain-resources', resources: { boar: 1 } }],
    },
    {
      tier: 2,
      requirementText: '9 built fences',
      requirement: { type: 'farm-count-at-least', target: 'fence', amount: 9 },
      rewardText: 'If you do, you immediately get 2 wild boar.',
      effects: [{ type: 'gain-resources', resources: { boar: 2 } }],
    },
    {
      tier: 3,
      requirementText: '12 built fences',
      requirement: { type: 'farm-count-at-least', target: 'fence', amount: 12 },
      rewardText: 'If you do, you immediately get 3 wild boar.',
      effects: [{ type: 'gain-resources', resources: { boar: 3 } }],
    },
  ],
} as const satisfies FatherCardDefinition
