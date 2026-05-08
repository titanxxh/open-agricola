import type { MajorCardData } from '../../cards/major/types'
import { createSingleHarvestExchange } from '../../cards/helpers/stage-effects'

export const joinery: MajorCardData = {
  id: 'Major_Joinery',
  name: 'Joinery',
  deck: 'major',
  number: 8,
  cost: { wood: 2, stone: 2 },
  vp: 2,
  extraVp: true,
  desc: [
    '[Harvest]',
    '<WOOD> <ARROW-1X> 2<FOOD>',
    '[Scoring]',
    '3/5/7<WOOD> <ARROW-1X> 1/2/3<SCORE>',
  ],
  scoring: {
    resource: 'wood',
    map: {
      '3-4': 1,
      '5-6': 2,
      '7+': 3,
    },
  },
  onHarvest: createSingleHarvestExchange('wood', { food: 2 }, { sourceId: 'Major_Joinery' }),
}
