import { MinorImprovement } from '../types'

export const A39_Chapel = new MinorImprovement({
  id: "A39_Chapel",
  name: "Chapel",
  deck: "A",
  number: 39,
  category: "POINTS_PROVIDER",
  desc: [],
  cost: {},
  prerequisite: "2 Occupations",
  occupationPrerequisites: {"min":2},
})
