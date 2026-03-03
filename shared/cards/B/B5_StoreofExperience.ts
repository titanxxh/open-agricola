import { MinorImprovement } from '../types'

export const B5_StoreofExperience = new MinorImprovement({
  id: "B5_StoreofExperience",
  name: "Store of Experience",
  deck: "B",
  number: 5,
  category: "ACTIONS_BOOSTER",
  desc: ["If you have 0-4/5/6/7 occupations left in hand, you immediately get 1 <STONE>/<REED>/<CLAY>/<WOOD>."],
  cost: { food: 1 },
  passing: true,
  implemented: false,
})
