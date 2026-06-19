import type { FatherCardDefinition } from '../types'

export const PS02 = {
  id: 'PS02',
  kind: 'father',
  conditionText: 'If you have at least 1/2/3 pastures, you can turn this card face down.',
  text: 'If you have at least 1/2/3 pastures, you can turn this card face down. If you do, you immediately get 1/2/3 building resources of the type that your house is made of.',
  assets: { front: 'PS02.png', back: 'father' },
  rewards: [
    {
      tier: 1,
      requirementText: '1 pasture',
      requirement: { type: 'farm-count-at-least', target: 'pasture', amount: 1 },
      rewardText: 'If you do, you immediately get 1 building resource of the type that your house is made of.',
      effects: [{ type: 'manual', key: 'gain-house-material-1', reviewed: true }],
    },
    {
      tier: 2,
      requirementText: '2 pastures',
      requirement: { type: 'farm-count-at-least', target: 'pasture', amount: 2 },
      rewardText: 'If you do, you immediately get 2 building resources of the type that your house is made of.',
      effects: [{ type: 'manual', key: 'gain-house-material-2', reviewed: true }],
    },
    {
      tier: 3,
      requirementText: '3 pastures',
      requirement: { type: 'farm-count-at-least', target: 'pasture', amount: 3 },
      rewardText: 'If you do, you immediately get 3 building resources of the type that your house is made of.',
      effects: [{ type: 'manual', key: 'gain-house-material-3', reviewed: true }],
    },
  ],
} as const satisfies FatherCardDefinition
