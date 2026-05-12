import { Occupation } from '../types'

const CARD_ID = 'A107_Catcher'

export const A107_Catcher = new Occupation({
  id: CARD_ID,
  name: 'Catcher',
  deck: 'A',
  number: 107,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you place your 1st/2nd/3rd person in a round on a building resource accumulation space with exactly 5/4/3 building resources, you get 1 <FOOD>.'],
  cost: {},
  players: '1+',
})
