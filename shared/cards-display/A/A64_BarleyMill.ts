import { MinorImprovement } from '../types'

const CARD_ID = 'A64_BarleyMill'

export const A64_BarleyMill = new MinorImprovement({
  id: CARD_ID,
  name: "Barley Mill",
  deck: "A",
  number: 64,
  category: "FOOD_PROVIDER",
  desc: ["In the field phase of each harvest, you get 1 <FOOD> for each grain field that you harvest."],
  vp: 1,
  altCosts: [{ clay: 4 }, { stone: 2 }],
})
