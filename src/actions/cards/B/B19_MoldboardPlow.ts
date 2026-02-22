import { MinorImprovement } from '../types'

export const B19_MoldboardPlow = new MinorImprovement({
  id: "B19_MoldboardPlow",
  name: "Moldboard Plow",
  deck: "B",
  number: 19,
  category: "FARM_PLANNER",
  desc: [],
  cost: {"wood":2},
  prerequisite: "1 Occupation",
  occupationPrerequisites: {"min":1},
})
