import { MinorImprovement } from '../types'

export const C27_Blueprint = new MinorImprovement({
  id: "C27_Blueprint",
  name: "Blueprint",
  deck: "C",
  number: 27,
  category: "ACTIONS_BOOSTER",
  desc: ["You can build the major improvements __Joinery__, __Pottery__, and __Basketmaker's Workshop__ even when taking a __Minor Improvement__ action. They each cost you 1 <STONE> less."],
  cost: {"food":1},
})
