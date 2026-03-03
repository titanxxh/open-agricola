import { MinorImprovement } from '../types'

export const B6_ExcursiontotheQuarry = new MinorImprovement({
  id: "B6_ExcursiontotheQuarry",
  name: "Excursion to the Quarry",
  deck: "B",
  number: 6,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["You immediately get a number of <STONE> equal to the number of people you have."],
  cost: { food: 1 },
  passing: true,
  implemented: false,
})
