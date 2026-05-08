import { Occupation } from '../types'

const CARD_ID = 'A108_MushroomCollector'

export const A108_MushroomCollector = new Occupation({
  id: CARD_ID,
  name: "Mushroom Collector",
  deck: "A",
  number: 108,
  category: "FOOD_PROVIDER",
  desc: ["Immediately after each time you use a wood accumulation space, you can exchange 1 <WOOD> for 2 <FOOD>. If you do, place the <WOOD> on the accumulation space."],
  cost: {},
  players: "1+",
})
