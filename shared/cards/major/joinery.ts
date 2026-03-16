import type { MajorCardEffect } from './types'
import { createSingleHarvestExchange } from '../helpers/stage-effects'

export const joinery: MajorCardEffect = {
  id: 'Major_Joinery',
  cost: { wood: 2, stone: 2 },
  vp: 2,
  extraVp: true,
  description: [
    '[Harvest]',
    '1 <WOOD> → 2 <FOOD> (max 1)',
    '[Scoring]',
    '3/5/7 <WOOD> → 1/2/3 <SCORE>',
  ],
  scoring: {
    resource: 'wood',
    map: {
      '3-4': 1,
      '5-6': 2,
      '7+': 3,
    },
  },
  onHarvest: createSingleHarvestExchange('wood', { food: 2 }),
}
