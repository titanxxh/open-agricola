import { Occupation } from '../types'

const CARD_ID = 'A116_WoodCutter'

export const A116_WoodCutter = new Occupation({
  id: CARD_ID,
  name: "Wood Cutter",
  deck: "A",
  number: 116,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: [
    "Each time you use a wood accumulation space, you get 1 additional <WOOD>.",
  ],
  cost: {},
  players: "1+",
})
