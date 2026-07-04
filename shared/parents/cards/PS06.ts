import type { FatherCardDefinition } from '../types'

export const PS06 = {
  id: 'PS06',
  kind: 'father',
  conditionText: 'If you have at least 6/8/10 total cards in play, including the parent cards, you can turn this card face down.',
  text: 'If you have at least 6/8/10 total cards in play, including the parent cards, you can turn this card face down. If you do, you immediately get 1/3/5 food.',
  assets: { front: 'PS06.png', back: 'father' },
  rewards: [
    {
      tier: 1,
      requirementText: '6 total cards in play, including the parent cards',
      requirement: { type: 'total-cards-in-play-including-parents-at-least', amount: 6 },
      rewardText: 'If you do, you immediately get 1 food.',
      effects: [{ type: 'gain-resources', resources: { food: 1 } }],
    },
    {
      tier: 2,
      requirementText: '8 total cards in play, including the parent cards',
      requirement: { type: 'total-cards-in-play-including-parents-at-least', amount: 8 },
      rewardText: 'If you do, you immediately get 3 food.',
      effects: [{ type: 'gain-resources', resources: { food: 3 } }],
    },
    {
      tier: 3,
      requirementText: '10 total cards in play, including the parent cards',
      requirement: { type: 'total-cards-in-play-including-parents-at-least', amount: 10 },
      rewardText: 'If you do, you immediately get 5 food.',
      effects: [{ type: 'gain-resources', resources: { food: 5 } }],
    },
  ],
} as const satisfies FatherCardDefinition
