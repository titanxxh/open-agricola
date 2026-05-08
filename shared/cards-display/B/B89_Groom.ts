import { Occupation } from '../types'

const CARD_ID = 'B89_Groom'

export const B89_Groom = new Occupation({
  id: CARD_ID,
  name: 'Groom',
  deck: 'B',
  number: 89,
  category: 'FARM_PLANNER',
  desc: [
    'When you play this card, immediately get 1 <WOOD>. Once you live in a stone house, at the start of each round, you can build exactly 1 stable for 1 <WOOD>.',
  ],
  cost: {},
  players: '1+',
})
