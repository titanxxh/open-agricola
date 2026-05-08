import { MinorImprovement } from '../types'

const CARD_ID = 'A12_DrinkingTrough'

export const A12_DrinkingTrough = new MinorImprovement({
  id: CARD_ID,
  name: "Drinking Trough",
  deck: "A",
  number: 12,
  category: "FARM_PLANNER",
  desc: ["Each of your pastures (with or without a stable) can hold up to 2 more animals."],
  cost: { clay: 1 },
})
