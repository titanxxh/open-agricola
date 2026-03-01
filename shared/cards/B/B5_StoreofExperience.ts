import { MinorImprovement } from '../types'

export const B5_StoreofExperience = new MinorImprovement({
  id: "B5_StoreofExperience",
  name: "Store of Experience",
  deck: "B",
  number: 5,
  category: "ACTIONS_BOOSTER",
  desc: ["If you have played at least 5 different improvement cards, you immediately get 1 <GRAIN> and 1 <VEGETABLE>."],
  cost: { food: 1 },
  passing: true,
  implemented: false,
})
