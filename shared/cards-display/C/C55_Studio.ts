import { MinorImprovement } from '../types'

const CARD_ID = 'C55_Studio'

export const C55_Studio = new MinorImprovement({
  id: CARD_ID,
  name: "Studio",
  deck: "C",
  number: 55,
  category: "FOOD_PROVIDER",
  desc: ["In the feeding phase of each harvest, you can use this card to turn exactly 1 <WOOD>/<CLAY>/<STONE> into 2/2/3 <FOOD>."],
  vp: 1,
  cost: { clay: 1, reed: 1 },
})
