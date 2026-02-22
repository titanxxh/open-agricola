import { MinorImprovement } from '../types'

export const E75_StoneAxe = new MinorImprovement({
  id: "E75_StoneAxe",
  name: "Stone Axe",
  deck: "E",
  number: 75,
  desc: [],
  cost: {"wood":1,"clay":1},
  prerequisite: "2 Occupations",
  occupationPrerequisites: {"min":2},
})
