import { Occupation } from '../types'

const CARD_ID = 'C124_StoneImporter'

export const C124_StoneImporter = new Occupation({
  id: CARD_ID,
  name: "Stone Importer",
  deck: "C",
  number: 124,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["In the breeding phase of the 1st/2nd/3rd/4th/5th/6th harvest, you can use this card to buy exactly 2 <STONE> for 2/2/3/3/4/1 <FOOD>."],
  cost: {},
  players: "1+",
})
