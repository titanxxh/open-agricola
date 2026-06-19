import type { FatherCardDefinition } from '../types'

export const PS01 = {
  id: 'PS01',
  kind: 'father',
  conditionText: 'If you have at least 2/3/5 fields, you can turn this card face down.',
  text: 'If you have at least 2/3/5 fields, you can turn this card face down. If you do, you immediately get 1/2/3 stone.',
  assets: { front: 'PS01.png', back: 'father' },
  rewards: [
    {
      tier: 1,
      requirementText: '2 fields',
      requirement: { type: 'farm-count-at-least', target: 'field', amount: 2 },
      rewardText: 'If you do, you immediately get 1 stone.',
      effects: [{ type: 'gain-resources', resources: { stone: 1 } }],
    },
    {
      tier: 2,
      requirementText: '3 fields',
      requirement: { type: 'farm-count-at-least', target: 'field', amount: 3 },
      rewardText: 'If you do, you immediately get 2 stone.',
      effects: [{ type: 'gain-resources', resources: { stone: 2 } }],
    },
    {
      tier: 3,
      requirementText: '5 fields',
      requirement: { type: 'farm-count-at-least', target: 'field', amount: 5 },
      rewardText: 'If you do, you immediately get 3 stone.',
      effects: [{ type: 'gain-resources', resources: { stone: 3 } }],
    },
  ],
} as const satisfies FatherCardDefinition
