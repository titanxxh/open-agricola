import { Occupation } from '../types'

const CARD_ID = 'A137_RiverineShepherd'

export const A137_RiverineShepherd = new Occupation({
  id: CARD_ID,
  name: "Riverine Shepherd",
  deck: "A",
  number: 137,
  category: "GOODS_PROVIDER",
  desc: ["Each time you use the __Sheep Market__ or __Reed Bank__ accumulation space, you can also take 1 good from the respective other accumulation space, if possible."],
  cost: {},
  players: "3+",
  newSet: true,
})
