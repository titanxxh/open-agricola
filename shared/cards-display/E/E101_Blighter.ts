import { Occupation } from '../types'

const CARD_ID = 'E101_Blighter'

export const E101_Blighter = new Occupation({
  id: CARD_ID,
  name: "Blighter",
  deck: "E",
  number: 101,
  category: "BONUS_POINTS_-_GET",
  desc: ['When you play this card, you get 1 bonus <SCORE> for each complete stage left to play. You may not play any more occupations.'],
  cost: {},
  players: "1+",
  extraVp: true,
})
