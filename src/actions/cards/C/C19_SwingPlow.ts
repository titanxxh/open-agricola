import { MinorImprovement } from '../types'

export const C19_SwingPlow = new MinorImprovement({
  id: "C19_SwingPlow",
  name: "Swing Plow",
  deck: "C",
  number: 19,
  category: "FARM_PLANNER",
  desc: [],
  cost: {},
  prerequisite: "3 Occupations",
  occupationPrerequisites: {"min":3},
})
