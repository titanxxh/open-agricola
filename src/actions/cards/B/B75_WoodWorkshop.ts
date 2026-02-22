import { MinorImprovement } from '../types'

export const B75_WoodWorkshop = new MinorImprovement({
  id: "B75_WoodWorkshop",
  name: "Wood Workshop",
  deck: "B",
  number: 75,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Each time before you play or build an improvement, you get 1 <WOOD>."],
  cost: {},
  prerequisite: "1 Occupation",
  occupationPrerequisites: {"min":1},
})
