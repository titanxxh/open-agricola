import { MinorImprovement } from '../types'

const CARD_ID = 'B5_StoreofExperience'

export const B5_StoreofExperience = new MinorImprovement({
  id: CARD_ID,
  name: "Store of Experience",
  deck: "B",
  number: 5,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["If you have 0-4/5/6/7 occupations left in hand, you immediately get 1 <STONE>/<REED>/<CLAY>/<WOOD>."],
  passing: true,
})
