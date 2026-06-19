import type { FatherCardDefinition } from '../types'

export const PS08 = {
  id: 'PS08',
  kind: 'father',
  conditionText: 'If you have at most 7/5/3 unused farmyard spaces left, you can turn this card face down.',
  text: 'If you have at most 7/5/3 unused farmyard spaces left, you can turn this card face down. If you do, you immediately get 1 grain / 1 vegetable / both 1 grain and 1 vegetable.',
  assets: { front: 'PS08.png', back: 'father' },
  rewards: [
    {
      tier: 1,
      requirementText: 'at most 7 unused farmyard spaces left',
      requirement: { type: 'manual', key: 'unused-farmyard-spaces-at-most-7', reviewed: true },
      rewardText: 'If you do, you immediately get 1 grain.',
      effects: [{ type: 'gain-resources', resources: { grain: 1 } }],
    },
    {
      tier: 2,
      requirementText: 'at most 5 unused farmyard spaces left',
      requirement: { type: 'manual', key: 'unused-farmyard-spaces-at-most-5', reviewed: true },
      rewardText: 'If you do, you immediately get 1 vegetable.',
      effects: [{ type: 'gain-resources', resources: { vegetable: 1 } }],
    },
    {
      tier: 3,
      requirementText: 'at most 3 unused farmyard spaces left',
      requirement: { type: 'manual', key: 'unused-farmyard-spaces-at-most-3', reviewed: true },
      rewardText: 'If you do, you immediately get both 1 grain and 1 vegetable.',
      effects: [{ type: 'gain-resources', resources: { grain: 1, vegetable: 1 } }],
    },
  ],
} as const satisfies FatherCardDefinition
