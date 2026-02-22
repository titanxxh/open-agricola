import { MinorImprovement } from '../types'

export const A29_AleBenches = new MinorImprovement({
  id: "A29_AleBenches",
  name: "Ale-Benches",
  deck: "A",
  number: 29,
  category: "POINTS_PROVIDER",
  desc: [],
  cost: {"wood":1},
  prerequisite: "2 Occupations",
  occupationPrerequisites: {"min":2},
  newSet: true,
})
