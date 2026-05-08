import { Occupation } from '../types'

const CARD_ID = 'C110_HomeBrewer'

export const C110_HomeBrewer = new Occupation({
  id: CARD_ID,
  name: "Home Brewer",
  deck: "C",
  number: 110,
  category: "FOOD_PROVIDER",
  desc: ["After the field phase of each harvest, you can use this card to turn exactly 1 <GRAIN> into your choice of 3 <FOOD> or 1 bonus <SCORE>."],
  cost: {},
  players: "1+",
})
