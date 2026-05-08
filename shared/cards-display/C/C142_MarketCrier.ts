import { Occupation } from '../types'

const CARD_ID = 'C142_MarketCrier'

export const C142_MarketCrier = new Occupation({
  id: CARD_ID,
  name: "Market Crier",
  deck: "C",
  number: 142,
  category: "CROP_PROVIDER",
  desc: ["Each time you use the __Grain Seeds__ action space, you can get an additional 1 <GRAIN> and 1 <VEGETABLE>. If you do, each other player gets 1 <GRAIN>."],
  cost: {},
  players: "3+",
})
