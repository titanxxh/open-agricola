import { Occupation } from '../types'

const CARD_ID = 'A118_Treegardener'

export const A118_Treegardener = new Occupation({
  id: CARD_ID,
  name: "Treegardener",
  deck: "A",
  number: 118,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["In the field phase of each harvest, you get 1 <WOOD> and you can buy up to 2 additional <WOOD> for 1 <FOOD> each."],
  cost: {},
  players: "1+",
})
