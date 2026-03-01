import { MinorImprovement } from '../types'

export const B7_Wage = new MinorImprovement({
  id: "B7_Wage",
  name: "Wage",
  deck: "B",
  number: 7,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Immediately take 2 <FOOD> from the general supply."],
  cost: { food: 1 },
  passing: true,
  implemented: false,
})
