import { MinorImprovement } from '../types'

const CARD_ID = 'D60_LargePottery'

export const D60_LargePottery = new MinorImprovement({
  id: CARD_ID,
  name: 'Large Pottery',
  deck: 'D',
  number: 60,
  category: 'FOOD_PROVIDER',
  desc: [
    '[Anytime]',
    '<CLAY> <ARROW> 2<FOOD>',
    '[Scoring]',
    '3/5/6/7<CLAY> <ARROW-1X> 1/2/3/4<SCORE>',
  ],
  cost: { clay: 1, stone: 1 },
  vp: 3,
  extraVp: true,
  prerequisite: 'Return the Pottery',
  alsoCountsAs: ['major'],
  evenMoreSet: true,
  waresSalesmanGains: [{ clay: 1, reed: 1 }],
  exchanges: [
    { from: { clay: 1 }, to: { food: 2 }, triggers: ['anytime'] },
  ],
})
