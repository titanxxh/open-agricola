import { MinorImprovement } from '../types'

const CARD_ID = 'A62_BeerKeg'

export const A62_BeerKeg = new MinorImprovement({
  id: CARD_ID,
  name: "Beer Keg",
  deck: "A",
  number: 62,
  category: "FOOD_PROVIDER",
  desc: ["In the feeding phase of each harvest, you can use this card to exchange 1/2/3 <GRAIN> for 0/1/2 bonus <SCORE> and exactly 3 <FOOD>."],
  cost: { wood: 1 },
  prerequisite: "2 Grain in Your Supply",
  extraVp: true,
})
