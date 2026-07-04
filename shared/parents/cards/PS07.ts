import type { FatherCardDefinition } from '../types'

export const PS07 = {
  id: 'PS07',
  kind: 'father',
  conditionText: 'If you have at least 2/3/4 occupations, you can turn this card face down.',
  text: 'If you have at least 2/3/4 occupations, you can turn this card face down. If you do, you can immediately sow up to 1/2/3 fields. (This is considered a single __Sow__ action.)',
  assets: { front: 'PS07.png', back: 'father' },
  rewards: [
    {
      tier: 1,
      requirementText: '2 occupations',
      requirement: { type: 'played-card-at-least', cardType: 'occupation', amount: 2 },
      rewardText: 'If you do, you can immediately sow up to 1 field. (This is considered a single __Sow__ action.)',
      effects: [{ type: 'manual', key: 'sow-up-to-1-field-single-sow-action', reviewed: true }],
    },
    {
      tier: 2,
      requirementText: '3 occupations',
      requirement: { type: 'played-card-at-least', cardType: 'occupation', amount: 3 },
      rewardText: 'If you do, you can immediately sow up to 2 fields. (This is considered a single __Sow__ action.)',
      effects: [{ type: 'manual', key: 'sow-up-to-2-fields-single-sow-action', reviewed: true }],
    },
    {
      tier: 3,
      requirementText: '4 occupations',
      requirement: { type: 'played-card-at-least', cardType: 'occupation', amount: 4 },
      rewardText: 'If you do, you can immediately sow up to 3 fields. (This is considered a single __Sow__ action.)',
      effects: [{ type: 'manual', key: 'sow-up-to-3-fields-single-sow-action', reviewed: true }],
    },
  ],
} as const satisfies FatherCardDefinition
