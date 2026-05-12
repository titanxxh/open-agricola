import { Occupation } from '../types'

const CARD_ID = 'A109_SmallTrader'

export const A109_SmallTrader = new Occupation({
  id: CARD_ID,
  name: "Small Trader",
  deck: "A",
  number: 109,
  category: "FOOD_PROVIDER",
  desc: ["Each time you take a __Major or Minor Improvement__ action, if you play a card from your hand instead of taking a major improvement from the board, you also get 3 <FOOD>."],
  cost: {},
  players: "1+",
})
