import { Occupation } from '../types'

const CARD_ID = 'E162_Entrepreneur'

export const E162_Entrepreneur = new Occupation({
  id: CARD_ID,
  name: 'Entrepreneur',
  deck: 'E',
  number: 162,
  desc: ['At the start of each round, you can move 1 <FOOD> to this card or discard 1 <FOOD> from it. If you do either, you get 1 building resource of a type you currently do not have.'],
  cost: {},
  players: '4+',
  category: 'BUILDING_RESOURCES',
})
