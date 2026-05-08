import { MinorImprovement } from '../types'

const CARD_ID = 'C51_FishingNet'

export const C51_FishingNet = new MinorImprovement({
  id: CARD_ID,
  name: "Fishing Net",
  deck: "C",
  number: 51,
  category: "FOOD_PROVIDER",
  desc: ["Each time another player uses the __Fishing__ accumulation space, they must first pay you 1 <FOOD>. Then, in the returning home phase of that round, place 2 <FOOD> on __Fishing__."],
  cost: {"reed":1},
  vp: 1,
})
