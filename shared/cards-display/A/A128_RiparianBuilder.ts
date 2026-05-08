import { Occupation } from '../types'

const CARD_ID = 'A128_RiparianBuilder'

export const A128_RiparianBuilder = new Occupation({
  id: CARD_ID,
  name: "Riparian Builder",
  deck: "A",
  number: 128,
  category: "FARM_PLANNER",
  desc: ["Each time another player uses the __Reed Bank__ accumulation space, you can build a room: if you build a clay/stone room, you get a discount of 1 <CLAY>/2 <STONE>."],
  cost: {},
  players: "3+",
  newSet: true,
})
