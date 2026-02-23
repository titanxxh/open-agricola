import { MinorImprovement } from '../types'

export const E81_AlchemistsLab = new MinorImprovement({
  id: "E81_AlchemistsLab",
  name: "Alchemists Lab",
  deck: "E",
  number: 81,
  desc: ["This card is an action space for all. A player who uses it gets 1 building resource of each type they already have. If another player uses it, they must first pay you 1 <FOOD>."],
  cost: {},
  prerequisite: "3 Occupations",
  occupationPrerequisites: {"min":3},
})
