import { MinorImprovement } from '../types'
export const E8_FarmersMarket = new MinorImprovement({
  id: "E8_FarmersMarket",
  name: "Farmer's Market",
  deck: "E",
  number: 8,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Immediately get 1 <FOOD> for each <VEGETABLE> in your supply."],
  cost: {},
  passing: true,
})
