import type { MajorCardEffect } from './types'

export const basketmaker: MajorCardEffect = {
  id: 'Major_Basket',
  cost: { reed: 2, stone: 2 },
  vp: 2,
  extraVp: true,
  description: [
    '[Harvest]',
    'Reed → 3 food (max 1)',
    '[Scoring]',
    '2/4/5 reed → 1/2/3 score',
  ],
  scoring: {
    resource: 'reed',
    map: {
      '2-3': 1,
      '4': 2,
      '5+': 3,
    },
  },
}
