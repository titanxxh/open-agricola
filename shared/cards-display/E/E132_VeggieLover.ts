import { Occupation } from '../types'

const CARD_ID = 'E132_VeggieLover'

export const E132_VeggieLover = new Occupation({
  id: CARD_ID,
  name: "Veggie Lover",
  deck: "E",
  number: 132,
  category: "BONUS_POINTS",
  desc: [
    '[Harvest]',
    '<GRAIN_VEG_STACK> <ARROW-1X> 6<FOOD>',
    '[Scoring]',
    '1/2/3 <GRAIN_VEG_STACK> <ARROW-1X> 2/4/6 <SCORE>',
  ],
  cost: {},
  players: "3+",
})
