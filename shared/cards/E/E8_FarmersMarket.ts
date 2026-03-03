import { MinorImprovement } from '../types'
export const E8_FarmersMarket = new MinorImprovement({
  id: "E8_FarmersMarket",
  name: "Farmer's Market",
  deck: "E",
  number: 8,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["You immediately get 1 <VEGETABLE>. (Effectively, you are buying 1 <VEGETABLE> for 2 <FOOD>.)"],
  cost: {},
  passing: true,
  implemented: false,
})
