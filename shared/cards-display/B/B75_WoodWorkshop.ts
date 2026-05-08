import { MinorImprovement } from '../types'

const CARD_ID = 'B75_WoodWorkshop'

export const B75_WoodWorkshop = new MinorImprovement({
  id: CARD_ID,
  name: "Wood Workshop",
  deck: "B",
  number: 75,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Each time before you play or build an improvement, you get 1 <WOOD>."],
  cost: {"clay":1},
  prerequisite: "1 Occupation",
  occupationPrerequisites: {"min":1},
})
