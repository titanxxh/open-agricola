import { MinorImprovement } from '../types'

const CARD_ID = 'D5_FieldClay'

export const D5_FieldClay = new MinorImprovement({
  id: CARD_ID,
  name: "Field Clay",
  deck: "D",
  number: 5,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["You immediately get 1 <CLAY> for each planted field you have."],
  cost: { food: 1 },
  passing: true,
  prerequisite: "1 Planted Field",
})
