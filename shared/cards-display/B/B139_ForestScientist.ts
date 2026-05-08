import { Occupation } from '../types'

const CARD_ID = 'B139_ForestScientist'

export const B139_ForestScientist = new Occupation({
  id: CARD_ID,
  name: 'Forest Scientist',
  deck: 'B',
  number: 139,
  category: 'FOOD_PROVIDER',
  desc: ['In the returning home phase of each round, if there is no wood left on the game board, you get 1 <FOOD>—from round 5 on, even 2 <FOOD>.'],
  cost: {},
  players: '3+',
  newSet: true,
})
