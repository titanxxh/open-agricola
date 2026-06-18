import type { FatherCardDefinition } from '../types'

export const PS04 = {
  id: 'PS04',
  kind: 'father',
  conditionText: 'If you have at least 3/4/6 animals of the same type, you can turn this card face down.',
  text: 'If you have at least 3/4/6 animals of the same type, you can turn this card face down. If you do, you immediately get 1/2/3 different building resources of your choice.',
  assets: { front: 'PS04.png', back: 'father' },
  rewards: [
    {
      tier: 1,
      requirementText: '3 animals of the same type',
      requirement: { type: 'manual', key: 'same-animal-type-at-least-3', reviewed: true },
      rewardText: 'If you do, you immediately get 1 different building resource of your choice.',
      effects: [{ type: 'manual', key: 'choose-1-different-building-resource', reviewed: true }],
    },
    {
      tier: 2,
      requirementText: '4 animals of the same type',
      requirement: { type: 'manual', key: 'same-animal-type-at-least-4', reviewed: true },
      rewardText: 'If you do, you immediately get 2 different building resources of your choice.',
      effects: [{ type: 'manual', key: 'choose-2-different-building-resources', reviewed: true }],
    },
    {
      tier: 3,
      requirementText: '6 animals of the same type',
      requirement: { type: 'manual', key: 'same-animal-type-at-least-6', reviewed: true },
      rewardText: 'If you do, you immediately get 3 different building resources of your choice.',
      effects: [{ type: 'manual', key: 'choose-3-different-building-resources', reviewed: true }],
    },
  ],
} as const satisfies FatherCardDefinition
