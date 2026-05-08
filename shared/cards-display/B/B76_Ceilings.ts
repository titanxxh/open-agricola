import { MinorImprovement } from '../types'

const CARD_ID = 'B76_Ceilings'

export const B76_Ceilings = new MinorImprovement({
  id: CARD_ID,
  name: "Ceilings",
  deck: "B",
  number: 76,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Place 1 <WOOD> on the next 5 round spaces. At the start of these rounds, you get the <WOOD>. Remove the <WOOD> promised by this card from future round spaces the next time you renovate."],
  cost: {"clay": 1},
  prerequisite: "1 Occupation",
  occupationPrerequisites: {"min": 1},
  implemented: true,
})
