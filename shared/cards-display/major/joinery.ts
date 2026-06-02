import type { MajorCardDisplay } from '../../cards/major/types'

export const joinery: MajorCardDisplay = {
  id: 'Major_Joinery',
  name: 'Joinery',
  deck: 'major',
  number: 8,
  cost: { wood: 2, stone: 2 },
  vp: 2,
  extraVp: true,
  waresSalesmanGains: [{ wood: 1, reed: 1 }],
  desc: [
    '[Harvest]',
    '<WOOD> <ARROW-1X> 2<FOOD>',
    '[Scoring]',
    '3/5/7<WOOD> <ARROW-1X> 1/2/3<SCORE>',
  ],
}
