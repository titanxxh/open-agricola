import { MinorImprovement } from '../types'

const CARD_ID = 'A55_JunkRoom'

export const A55_JunkRoom = new MinorImprovement({
  id: CARD_ID,
  name: "Junk Room",
  deck: "A",
  number: 55,
  category: "FOOD_PROVIDER",
  desc: ["Each time after you build an improvement, including this one, you get 1 <FOOD>."],
  cost: {"wood":1,"clay":1},
})
