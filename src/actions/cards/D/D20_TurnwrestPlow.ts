import { MinorImprovement } from '../types'

export const D20_TurnwrestPlow = new MinorImprovement({
  id: "D20_TurnwrestPlow",
  name: "Turnwrest Plow",
  deck: "D",
  number: 20,
  category: "FARM_PLANNER",
  desc: [],
  cost: {"wood":3},
  prerequisite: "2 Occupations",
  occupationPrerequisites: {"min":2},
})
