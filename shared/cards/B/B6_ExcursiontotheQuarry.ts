import { MinorImprovement } from '../types'

export const B6_ExcursiontotheQuarry = new MinorImprovement({
  id: "B6_ExcursiontotheQuarry",
  name: "Excursion to the Quarry",
  deck: "B",
  number: 6,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Immediately take 1 <STONE> from the general supply."],
  cost: { food: 1 },
  passing: true,
  implemented: false,
})
