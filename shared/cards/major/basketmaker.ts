import type { MajorCardEffect } from './types'
import { createSingleHarvestExchange } from '../helpers/stage-effects'

export const basketmaker: MajorCardEffect = {
  id: 'Major_Basket',
  cost: { reed: 2, stone: 2 },
  vp: 2,
  extraVp: true,
  description: [
    '[Harvest]',
    '<REED> <ARROW-1X> 3<FOOD>',
    '[Scoring]',
    '2/4/5<REED> <ARROW-1X> 1/2/3<SCORE>',
  ],
  scoring: {
    resource: 'reed',
    map: {
      '2-3': 1,
      '4': 2,
      '5+': 3,
    },
  },
  onHarvest: createSingleHarvestExchange('reed', { food: 3 }),
}
