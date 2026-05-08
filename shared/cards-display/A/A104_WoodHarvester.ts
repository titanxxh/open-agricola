import { Occupation } from '../types'

const CARD_ID = 'A104_WoodHarvester'

export const A104_WoodHarvester = new Occupation({
  id: CARD_ID,
  name: "Wood Harvester",
  deck: "A",
  number: 104,
  category: "GOODS_PROVIDER",
  desc: ["In the field phase of each harvest, you get 1 <WOOD>/1 <FOOD> for each wood accumulation space with exactly 2 <WOOD>/at least 3 <WOOD>."],
  cost: {},
  players: "1+",
})
