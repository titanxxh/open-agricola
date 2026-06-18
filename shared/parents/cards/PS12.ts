import type { FatherCardDefinition } from '../types'

export const PS12 = {
  id: 'PS12',
  kind: 'father',
  conditionText: 'If you have at least 2/3/4 vegetables in your supply, you can turn this card face down.',
  text: 'If you have at least 2/3/4 vegetables in your supply, you can turn this card face down. If you do, you immediately get 2/3/4 food.',
  assets: { front: 'PS12.png', back: 'father' },
  rewards: [
    {
      tier: 1,
      requirementText: '2 vegetables in your supply',
      requirement: { type: 'resource-at-least', resource: 'vegetable', amount: 2 },
      rewardText: 'If you do, you immediately get 2 food.',
      effects: [{ type: 'gain-resources', resources: { food: 2 } }],
    },
    {
      tier: 2,
      requirementText: '3 vegetables in your supply',
      requirement: { type: 'resource-at-least', resource: 'vegetable', amount: 3 },
      rewardText: 'If you do, you immediately get 3 food.',
      effects: [{ type: 'gain-resources', resources: { food: 3 } }],
    },
    {
      tier: 3,
      requirementText: '4 vegetables in your supply',
      requirement: { type: 'resource-at-least', resource: 'vegetable', amount: 4 },
      rewardText: 'If you do, you immediately get 4 food.',
      effects: [{ type: 'gain-resources', resources: { food: 4 } }],
    },
  ],
} as const satisfies FatherCardDefinition
