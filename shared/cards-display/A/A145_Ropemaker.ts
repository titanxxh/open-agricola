import { Occupation } from '../types'

const CARD_ID = 'A145_Ropemaker'

export const A145_Ropemaker = new Occupation({
  id: CARD_ID,
  name: "Ropemaker",
  deck: "A",
  number: 145,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["At the end of each harvest, you get 1 <REED> from the general supply."],
  cost: {},
  players: "3+",
})
