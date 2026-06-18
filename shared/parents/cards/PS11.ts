import type { FatherCardDefinition } from '../types'

export const PS11 = {
  id: 'PS11',
  kind: 'father',
  conditionText: 'If you have at least 3/4/5 grain in your supply, you can turn this card face down.',
  text: 'If you have at least 3/4/5 grain in your supply, you can turn this card face down. If you do, you immediately get 1/2/3 clay.',
  assets: { front: 'PS11.png', back: 'father' },
  rewards: [
    {
      tier: 1,
      requirementText: '3 grain in your supply',
      requirement: { type: 'resource-at-least', resource: 'grain', amount: 3 },
      rewardText: 'If you do, you immediately get 1 clay.',
      effects: [{ type: 'gain-resources', resources: { clay: 1 } }],
    },
    {
      tier: 2,
      requirementText: '4 grain in your supply',
      requirement: { type: 'resource-at-least', resource: 'grain', amount: 4 },
      rewardText: 'If you do, you immediately get 2 clay.',
      effects: [{ type: 'gain-resources', resources: { clay: 2 } }],
    },
    {
      tier: 3,
      requirementText: '5 grain in your supply',
      requirement: { type: 'resource-at-least', resource: 'grain', amount: 5 },
      rewardText: 'If you do, you immediately get 3 clay.',
      effects: [{ type: 'gain-resources', resources: { clay: 3 } }],
    },
  ],
} as const satisfies FatherCardDefinition
