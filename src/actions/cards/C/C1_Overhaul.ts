import { MinorImprovement } from '../types'

export const C1_Overhaul = new MinorImprovement({
  id: "C1_Overhaul",
  name: "Overhaul",
  deck: "C",
  number: 1,
  category: "FARM_PLANNER",
  desc: ["Immediately raze all of your fences, add up to 3 fences from your supply, and rebuild them. (You do not lose any animals during this.)"],
  cost: {"wood":1},
  prerequisite: "2 Occupations",
  occupationPrerequisites: {"min":2},
  passing: true,
  newSet: true,
})
