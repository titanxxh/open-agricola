import type { MajorCardDisplay } from '../../cards/major/types'

export const pottery: MajorCardDisplay = {
  id: 'Major_Pottery',
  name: 'Pottery',
  deck: 'major',
  number: 9,
  cost: { clay: 2, stone: 2 },
  vp: 2,
  extraVp: true,
  potteryIdentity: true,
  waresSalesmanGains: [{ clay: 1, reed: 1 }],
  desc: [
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
}
