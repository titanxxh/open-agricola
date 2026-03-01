import { MinorImprovement } from '../types'

export const B4_WoodPile = new MinorImprovement({
  id: "B4_WoodPile",
  name: "Wood Pile",
  deck: "B",
  number: 4,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["You immediately get 3 <WOOD>."],
  cost: { food: 2 },
  passing: true,
})
