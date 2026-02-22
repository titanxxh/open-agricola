import type { MajorCardEffect } from './types'

export const joinery: MajorCardEffect = {
  id: 'Major_Joinery',
  cost: { wood: 2, stone: 2 },
  vp: 2,
  extraVp: true,
  description: [
    '[Harvest]',
    'Wood → 2 food (max 1)',
    '[Scoring]',
    '3/5/7 wood → 1/2/3 score',
  ],
  scoring: {
    resource: 'wood',
    map: {
      '3-4': 1,
      '5-6': 2,
      '7+': 3,
    },
  },
}
