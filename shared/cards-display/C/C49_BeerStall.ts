import { MinorImprovement } from '../types'

const CARD_ID = 'C49_BeerStall'

export const C49_BeerStall = new MinorImprovement({
  id: CARD_ID,
  name: "Beer Stall",
  deck: "C",
  number: 49,
  category: "FOOD_PROVIDER",
  desc: ['In the feeding phase of each harvest, for each empty unfenced stable you have, you can exchange 1 <GRAIN> for 5 <FOOD>.'],
  cost: { wood: 1 },
})
