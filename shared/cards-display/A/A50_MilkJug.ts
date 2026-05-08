import { MinorImprovement } from '../types'

const CARD_ID = 'A50_MilkJug'

export const A50_MilkJug = new MinorImprovement({
  id: CARD_ID,
  name: "Milk Jug",
  deck: "A",
  number: 50,
  category: "FOOD_PROVIDER",
  desc: [
    "Each time any player (including you) uses the __Cattle Market__ accumulation space, you get 3 <FOOD>, and each other player gets 1 <FOOD>.",
  ],
  cost: { clay: 1 },
})
