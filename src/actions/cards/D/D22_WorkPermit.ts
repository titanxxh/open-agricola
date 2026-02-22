import { MinorImprovement } from '../types'

export const D22_WorkPermit = new MinorImprovement({
  id: "D22_WorkPermit",
  name: "Work Permit",
  deck: "D",
  number: 22,
  category: "ACTIONS_BOOSTER",
  desc: [],
  cost: {"food":1},
  prerequisite: "At Least 1 Building Resource",
})
