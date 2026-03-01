import { MinorImprovement } from '../types'

export const B8_MarketStall = new MinorImprovement({
  id: "B8_MarketStall",
  name: "Market Stall",
  deck: "B",
  number: 8,
  category: "COOKING",
  desc: ["Immediately get 1 <FOOD> for each <GRAIN> and each <VEGETABLE> in your supply."],
  cost: { wood: 1 },
  passing: true,
})
