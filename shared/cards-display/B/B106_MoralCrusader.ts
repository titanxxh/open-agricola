import { Occupation } from '../types'

const CARD_ID = 'B106_MoralCrusader'

export const B106_MoralCrusader = new Occupation({
  id: CARD_ID,
  name: 'Moral Crusader',
  deck: 'B',
  number: 106,
  category: 'FOOD_PROVIDER',
  desc: ['Immediately before the start of each round, if there are goods on the remaining round spaces that are promised to you, you get 1 <FOOD>.'],
  cost: {},
  players: '1+',
})
