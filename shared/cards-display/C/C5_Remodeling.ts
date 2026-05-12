import { MinorImprovement } from '../types'

const CARD_ID = 'C5_Remodeling'

export const C5_Remodeling = new MinorImprovement({
  id: CARD_ID,
  name: "Remodeling",
  deck: "C",
  number: 5,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["You immediately get 1 <CLAY> for each clay room and for each major improvement you have."],
  cost: { food: 1 },
  passing: true,
})
