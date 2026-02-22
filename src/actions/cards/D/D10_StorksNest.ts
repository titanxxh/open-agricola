import { MinorImprovement } from '../types'

export const D10_StorksNest = new MinorImprovement({
  id: "D10_StorksNest",
  name: "D10_StorksNest",
  deck: "D",
  number: 10,
  category: "FARM_PLANNER",
  desc: [],
  cost: {"reed":1},
  prerequisite: "5 Occupations",
  occupationPrerequisites: {"min":5},
})
