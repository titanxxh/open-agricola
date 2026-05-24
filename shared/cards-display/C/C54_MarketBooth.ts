import { MinorImprovement } from '../types'

const CARD_ID = 'C54_MarketBooth'

export const C54_MarketBooth = new MinorImprovement({
  id: CARD_ID,
  name: "Market Booth",
  deck: "C",
  number: 54,
  category: "FOOD_PROVIDER",
  desc: ["After the field phase of each harvest, you can exchange 1 <GRAIN> plus 1 <FENCE> (both from your supply) for 5 <FOOD>."],
  cost: { stable: 1 },
})
