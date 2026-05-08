import { MinorImprovement } from '../types'

const CARD_ID = 'D61_BaleofStraw'

export const D61_BaleofStraw = new MinorImprovement({
  id: CARD_ID,
  name: "Bale of Straw",
  deck: "D",
  number: 61,
  category: "FOOD_PROVIDER",
  desc: ["At the start of each harvest, if you have at least 3 grain fields (including field cards with planted grain), you get 2 <FOOD>."],
  cost: {},
})
