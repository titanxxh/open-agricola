import { Occupation } from '../types'

const CARD_ID = 'D133_BeerTentOperator'

export const D133_BeerTentOperator = new Occupation({
  id: CARD_ID,
  name: "Beer Tent Operator",
  deck: "D",
  number: 133,
  category: "POINTS_PROVIDER",
  desc: ["In the feeding phase of each harvest, you can use this card to turn 1 <WOOD> plus 1 <GRAIN> into 1 bonus <SCORE> and 2 <FOOD>."],
  cost: {},
  players: "3+",
  extraVp: true,
})
