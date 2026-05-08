import { Occupation } from '../types'

const CARD_ID = 'D100_LordoftheManor'

export const D100_LordoftheManor = new Occupation({
  id: CARD_ID,
  name: "Lord of the Manor",
  deck: "D",
  number: 100,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 bonus <SCORE> for each scoring category in which you score the maximum 4 points. (The bonus point is also awarded for 4 fenced stables.)"],
  cost: {},
  players: "1+",
  newSet: true,
})
