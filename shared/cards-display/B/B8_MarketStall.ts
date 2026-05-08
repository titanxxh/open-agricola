import { MinorImprovement } from '../types'

const CARD_ID = 'B8_MarketStall'

export const B8_MarketStall = new MinorImprovement({
  id: CARD_ID,
  name: "Market Stall",
  deck: "B",
  number: 8,
  category: "CROP_PROVIDER",
  desc: ["You immediately get 1 <VEGETABLE>. (Effectively, you are exchanging 1 <GRAIN> for 1 <VEGETABLE>)."],
  cost: { grain: 1 },
  passing: true,
})
