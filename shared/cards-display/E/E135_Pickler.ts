import { Occupation } from '../types'

const CARD_ID = 'E135_Pickler'

export const E135_Pickler = new Occupation({
  id: CARD_ID,
  name: "Pickler",
  deck: "E",
  number: 135,
  category: "BONUS_POINTS_-_4_WOOD_CARD_COMPETITION",
  desc: ['If there are still 1/3/6/9 complete rounds left to play, you immediately get 1/2/3/4 <WOOD>. During scoring, each player with the most total <VEGETABLE> gets 3 bonus <SCORE>.'],
  cost: {},
  players: "3+",
  extraVp: true,
})
