import { Occupation } from '../types'

const CARD_ID = 'D137_TradeTeacher'

export const D137_TradeTeacher = new Occupation({
  id: CARD_ID,
  name: "Trade Teacher",
  deck: "D",
  number: 137,
  category: "GOODS_PROVIDER",
  desc: ["Each time after you use a __Lesson__ action space, you can buy up to 2 different goods: <GRAIN>, <STONE>, <SHEEP>, and <PIG> for 1 <FOOD> each; <CATTLE> and <VEGETABLE> for 2 food each."],
  cost: {},
  players: "3+",
})
