import { Occupation } from '../types'

export const D124_Emissary = new Occupation({
  id: "D124_Emissary",
  name: "Emissary",
  deck: "D",
  number: 124,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["At any time, you can place a good from your supply on this card to get 1 <STONE>. You must place different goods on this card. (<FOOD> is also considered a good.)"],
  cost: {},
  players: "1+",
  newSet: true,
})
