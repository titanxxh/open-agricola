import { MinorImprovement } from '../types'

const CARD_ID = 'C41_FarmStore'

export const C41_FarmStore = new MinorImprovement({
  id: CARD_ID,
  name: "Farm Store",
  deck: "C",
  number: 41,
  category: "GOODS_PROVIDER",
  desc: ["After the feeding phase of each harvest, you can exchange exactly 1 <FOOD> for 2 different building resources of your choice or 1 <VEGETABLE>."],
  cost: { wood: 2, clay: 2 },
})
