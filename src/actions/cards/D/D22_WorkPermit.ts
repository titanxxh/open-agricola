import { MinorImprovement } from '../types'

export const D22_WorkPermit = new MinorImprovement({
  id: "D22_WorkPermit",
  name: "Work Permit",
  deck: "D",
  number: 22,
  category: "ACTIONS_BOOSTER",
  desc: ["Add 1 to the current round for each building resource you have and place 1 person from your supply on the corresponding round space. In that round, you can use the person."],
  cost: {"food":1},
  prerequisite: "At Least 1 Building Resource",
})
