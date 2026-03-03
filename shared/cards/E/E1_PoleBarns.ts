import { MinorImprovement } from '../types'
export const E1_PoleBarns = new MinorImprovement({
  id: "E1_PoleBarns",
  name: "Pole Barns",
  deck: "E",
  number: 1,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["You can immediately build up to 3 stables at no cost. (You must pay the cost of this card though.)"],
  cost: { food: 2 },
  passing: true,
  implemented: false,
})
