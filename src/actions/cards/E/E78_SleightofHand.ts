import { MinorImprovement } from '../types'

export const E78_SleightofHand = new MinorImprovement({
  id: "E78_SleightofHand",
  name: "Sleight of Hand",
  deck: "E",
  number: 78,
  desc: ["When you play this card, you can immediately exchange up to 4 building resources for an equal number of other building resources."],
  cost: {},
  prerequisite: "3 Occupations",
  occupationPrerequisites: {"min":3},
})
