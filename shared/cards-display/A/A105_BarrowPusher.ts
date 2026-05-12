import { Occupation } from '../types'

const CARD_ID = 'A105_BarrowPusher'

export const A105_BarrowPusher = new Occupation({
  id: CARD_ID,
  name: "Barrow Pusher",
  deck: "A",
  number: 105,
  category: "GOODS_PROVIDER",
  desc: ["For each new field tile you get, you also get 1 <CLAY> and 1 <FOOD>."],
  cost: {},
  players: "1+",
})
