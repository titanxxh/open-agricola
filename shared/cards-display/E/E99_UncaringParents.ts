import { Occupation } from '../types'

const CARD_ID = 'E99_UncaringParents'

export const E99_UncaringParents = new Occupation({
  id: CARD_ID,
  name: "Uncaring Parents",
  deck: "E",
  number: 99,
  category: "BONUS_POINTS_-_GET",
  desc: ["At the end of each harvest, if you live in a stone house, you get 1 bonus <SCORE>."],
  cost: {},
  players: "1+",
})
