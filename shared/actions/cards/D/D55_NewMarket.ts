import { MinorImprovement } from '../types'

export const D55_NewMarket = new MinorImprovement({
  id: "D55_NewMarket",
  name: "New Market",
  deck: "D",
  number: 55,
  category: "FOOD_PROVIDER",
  desc: ["Each time you use an action space card on round spaces 8 to 11, you get 1 additional <FOOD>."],
  cost: {"wood":1,"clay":1},
  newSet: true,
})
