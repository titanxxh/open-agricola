import { MinorImprovement } from '../types'

const CARD_ID = 'D55_NewMarket'

export const D55_NewMarket = new MinorImprovement({
  id: CARD_ID,
  name: "New Market",
  deck: "D",
  number: 55,
  category: "FOOD_PROVIDER",
  desc: ["Each time you use an action space card on round spaces 8 to 11, you get 1 additional <FOOD>."],
  cost: { wood: 1, clay: 1 },
  vp: 1,
})
