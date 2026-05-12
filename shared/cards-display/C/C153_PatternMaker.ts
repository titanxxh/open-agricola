import { Occupation } from '../types'

const CARD_ID = 'C153_PatternMaker'

export const C153_PatternMaker = new Occupation({
  id: CARD_ID,
  name: 'Pattern Maker',
  deck: 'C',
  number: 153,
  category: 'POINTS_PROVIDER',
  desc: [
    'Each time another player renovates, you can exchange exactly 2 <WOOD> for 1 <GRAIN>, 1 <FOOD>, and 1 bonus <SCORE>.',
  ],
  cost: {},
  players: '4+',
  extraVp: true,
})
