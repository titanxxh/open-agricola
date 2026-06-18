import type { FatherCardDefinition } from '../types'

export const PS09 = {
  id: 'PS09',
  kind: 'father',
  conditionText: 'If you have built at least 2/3/4 stables, you can turn this card face down.',
  text: 'If you have built at least 2/3/4 stables, you can turn this card face down. If you do, you immediately get 1/2/3 sheep.',
  assets: { front: 'PS09.png', back: 'father' },
  rewards: [
    {
      tier: 1,
      requirementText: '2 built stables',
      requirement: { type: 'farm-count-at-least', target: 'stable', amount: 2 },
      rewardText: 'If you do, you immediately get 1 sheep.',
      effects: [{ type: 'gain-resources', resources: { sheep: 1 } }],
    },
    {
      tier: 2,
      requirementText: '3 built stables',
      requirement: { type: 'farm-count-at-least', target: 'stable', amount: 3 },
      rewardText: 'If you do, you immediately get 2 sheep.',
      effects: [{ type: 'gain-resources', resources: { sheep: 2 } }],
    },
    {
      tier: 3,
      requirementText: '4 built stables',
      requirement: { type: 'farm-count-at-least', target: 'stable', amount: 4 },
      rewardText: 'If you do, you immediately get 3 sheep.',
      effects: [{ type: 'gain-resources', resources: { sheep: 3 } }],
    },
  ],
} as const satisfies FatherCardDefinition
