import { MinorImprovement } from '../types'

const CARD_ID = 'B4_WoodPile'

export const B4_WoodPile = new MinorImprovement({
  id: CARD_ID,
  name: "Wood Pile",
  deck: "B",
  number: 4,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["You immediately get a number of <WOOD> equal to the number of people you have on accumulation spaces."],
  cost: {},
  passing: true,
})
