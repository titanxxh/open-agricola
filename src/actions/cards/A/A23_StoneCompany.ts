import { MinorImprovement } from '../types'

export const A23_StoneCompany = new MinorImprovement({
  id: "A23_StoneCompany",
  name: "Stone Company",
  deck: "A",
  number: 23,
  category: "ACTIONS_BOOSTER",
  desc: ["Immediately after each time you use a __Quarry__ accumulation space, you get a __Major or Minor Improvement__ action during which you must spend at least 1 <STONE>."],
  cost: {"clay":2,"reed":1},
})
