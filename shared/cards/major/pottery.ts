import type { MajorCardEffect } from './types'
import { createSingleHarvestExchange } from '../helpers/stage-effects'

export const pottery: MajorCardEffect = {
  id: 'Major_Pottery',
  cost: { clay: 2, stone: 2 },
  vp: 2,
  extraVp: true,
  description: [
    '[Harvest]',
    '<CLAY> <ARROW-1X> 2<FOOD>',
    '[Scoring]',
    '3/5/7<CLAY> <ARROW-1X> 1/2/3<SCORE>',
  ],
  scoring: {
    resource: 'clay',
    map: {
      '3-4': 1,
      '5-6': 2,
      '7+': 3,
    },
  },
  onHarvest: createSingleHarvestExchange('clay', { food: 2 }),
}
