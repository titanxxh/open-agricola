import type { MajorCardDisplay } from '../../cards/major/types'

export const basketmaker: MajorCardDisplay = {
  id: 'Major_Basket',
  name: 'Basketmaker',
  deck: 'major',
  number: 10,
  cost: { reed: 2, stone: 2 },
  vp: 2,
  extraVp: true,
  waresSalesmanGains: [{ reed: 2 }],
  desc: [
    '[Harvest]',
    '<REED> <ARROW-1X> 3<FOOD>',
    '[Scoring]',
    '2/4/5<REED> <ARROW-1X> 1/2/3<SCORE>',
  ],
}
