import { Occupation } from '../types'

const CARD_ID = 'C118_WoodCollector'

export const C118_WoodCollector = new Occupation({
  id: CARD_ID,
  name: "Wood Collector",
  deck: "C",
  number: 118,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["Place 1 <WOOD> on each of the next 5 round spaces. At the start of these rounds, you get the <WOOD>."],
  players: "1+",
})
