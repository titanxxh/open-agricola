import type { FatherCardDefinition } from '../types'

export const PS03 = {
  id: 'PS03',
  kind: 'father',
  conditionText: 'If you have animals of at least 1/2/3 types, you can turn this card face down.',
  text: 'If you have animals of at least 1/2/3 types, you can turn this card face down. If you do, you immediately get 1 minor improvement / 1 occupation / both 1 minor improvement and 1 occupation. To do so, draw three cards of each eligible type and keep one.',
  assets: { front: 'PS03.png', back: 'father' },
  rewards: [
    {
      tier: 1,
      requirementText: 'animals of 1 type',
      requirement: { type: 'animal-type-count-at-least', amount: 1 },
      rewardText: 'If you do, you immediately get 1 minor improvement. To do so, draw three cards of each eligible type and keep one.',
      effects: [{ type: 'manual', key: 'draw-3-minor-improvements-keep-1', reviewed: true }],
    },
    {
      tier: 2,
      requirementText: 'animals of 2 types',
      requirement: { type: 'animal-type-count-at-least', amount: 2 },
      rewardText: 'If you do, you immediately get 1 occupation. To do so, draw three cards of each eligible type and keep one.',
      effects: [{ type: 'manual', key: 'draw-3-occupations-keep-1', reviewed: true }],
    },
    {
      tier: 3,
      requirementText: 'animals of 3 types',
      requirement: { type: 'animal-type-count-at-least', amount: 3 },
      rewardText: 'If you do, you immediately get both 1 minor improvement and 1 occupation. To do so, draw three cards of each eligible type and keep one.',
      effects: [{ type: 'manual', key: 'draw-3-minor-improvements-and-3-occupations-keep-1-each', reviewed: true }],
    },
  ],
} as const satisfies FatherCardDefinition
