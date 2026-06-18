import type { FatherCardDefinition } from '../types'

export const PS05 = {
  id: 'PS05',
  kind: 'father',
  conditionText: 'If you have at least 1/2/3 major improvements, you can turn this card face down.',
  text: 'If you have at least 1/2/3 major improvements, you can turn this card face down. If you do, you immediately get 1 wood / 2 clay / 3 reed.',
  assets: { front: 'PS05.png', back: 'father' },
  rewards: [
    {
      tier: 1,
      requirementText: '1 major improvement',
      requirement: { type: 'played-card-at-least', cardType: 'major-improvement', amount: 1 },
      rewardText: 'If you do, you immediately get 1 wood.',
      effects: [{ type: 'gain-resources', resources: { wood: 1 } }],
    },
    {
      tier: 2,
      requirementText: '2 major improvements',
      requirement: { type: 'played-card-at-least', cardType: 'major-improvement', amount: 2 },
      rewardText: 'If you do, you immediately get 2 clay.',
      effects: [{ type: 'gain-resources', resources: { clay: 2 } }],
    },
    {
      tier: 3,
      requirementText: '3 major improvements',
      requirement: { type: 'played-card-at-least', cardType: 'major-improvement', amount: 3 },
      rewardText: 'If you do, you immediately get 3 reed.',
      effects: [{ type: 'gain-resources', resources: { reed: 3 } }],
    },
  ],
} as const satisfies FatherCardDefinition
