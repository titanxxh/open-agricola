import { MinorImprovement } from '../types'

const CARD_ID = 'C53_GypsysCrock'

export const C53_GypsysCrock = new MinorImprovement({
  id: CARD_ID,
  name: "Gypsy's Crock",
  deck: 'C',
  number: 53,
  category: 'FOOD_PROVIDER',
  desc: ["Each time you use a cooking improvement to turn 2 goods into <FOOD> at the same time, you get 1 additional <FOOD>."],
  cost: { clay: 2 },
  vp: 1,
})
