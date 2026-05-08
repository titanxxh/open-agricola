import { Occupation } from '../types'

const CARD_ID = 'D107_Bellfounder'

export const D107_Bellfounder = new Occupation({
  id: CARD_ID,
  name: "Bellfounder",
  deck: "D",
  number: 107,
  category: "FOOD_PROVIDER",
  desc: ["In the returning home phase of each round, if you have at least 1 <CLAY>, you can use this card to discard all of your <CLAY> and get your choice of 3 <FOOD> or 1 bonus <SCORE>."],
  cost: {},
  players: "1+",
})
