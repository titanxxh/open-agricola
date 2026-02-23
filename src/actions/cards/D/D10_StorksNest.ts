import { MinorImprovement } from '../types'

export const D10_StorksNest = new MinorImprovement({
  id: "D10_StorksNest",
  name: "Stork's Nest",
  deck: "D",
  number: 10,
  category: "FARM_PLANNER",
  desc: ["In the returning home phase of each round, if you have more rooms than people, you can pay 1 <FOOD> to take a __Family Growth__ action."],
  cost: {"reed":1},
  prerequisite: "5 Occupations",
  occupationPrerequisites: {"min":5},
})
