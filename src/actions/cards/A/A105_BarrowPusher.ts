import { Occupation } from '../types'

export const A105_BarrowPusher = new Occupation({
  id: "A105_BarrowPusher",
  name: "Barrow Pusher",
  deck: "A",
  number: 105,
  category: "GOODS_PROVIDER",
  desc: ["For each new field tile you get, you also get 1 <CLAY> and 1 <FOOD>."],
  cost: {},
  players: "1+",
  newSet: true,
})
