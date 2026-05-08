import { MinorImprovement } from '../types'

const CARD_ID = 'B82_ValueAssets'

export const B82_ValueAssets = new MinorImprovement({
  id: CARD_ID,
  name: "Value Assets",
  deck: "B",
  number: 82,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["After each harvest, you can buy exactly one of the following goods: 1 <FOOD> <ARROW> 1 <WOOD>; 1 <FOOD> <ARROW> 1 <CLAY>; 2 <FOOD> <ARROW> 1 <REED>; 2 <FOOD> <ARROW> 1 <STONE>"],
  cost: {},
})
