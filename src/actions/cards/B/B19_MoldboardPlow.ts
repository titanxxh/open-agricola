import { MinorImprovement } from '../types'

export const B19_MoldboardPlow = new MinorImprovement({
  id: "B19_MoldboardPlow",
  name: "Moldboard Plow",
  deck: "B",
  number: 19,
  category: "FARM_PLANNER",
  desc: ["Place 2 field tiles on this card. Twice this game, when you use the __Farmland__ action space, you can also plow 1 field from this card."],
  cost: {"wood":2},
  prerequisite: "1 Occupation",
  occupationPrerequisites: {"min":1},
})
