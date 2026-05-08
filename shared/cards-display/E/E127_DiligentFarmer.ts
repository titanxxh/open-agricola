import { Occupation } from '../types'

const CARD_ID = 'E127_DiligentFarmer'

export const E127_DiligentFarmer = new Occupation({
  id: CARD_ID,
  name: 'Diligent Farmer',
  deck: 'E',
  number: 127,
  category: 'FARMYARD_-_PLACE_FOR_PERSON',
  desc: ['When you play this card, if you would score the maximum 4 points in 3 scoring categories (including fenced stables), you can extend your house by 1 room at no cost.'],
  players: '3+',
})
