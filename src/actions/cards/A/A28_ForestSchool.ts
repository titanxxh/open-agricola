import { MinorImprovement } from '../types'

export const A28_ForestSchool = new MinorImprovement({
  id: "A28_ForestSchool",
  name: "Forest School",
  deck: "A",
  number: 28,
  category: "ACTIONS_BOOSTER",
  desc: ["You can consider the __Lessons__ action spaces not occupied. You can replace each <FOOD> that an occupation costs with <WOOD>."],
  cost: {"wood":1,"clay":1},
})
