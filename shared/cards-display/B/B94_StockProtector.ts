import { Occupation } from '../types'

const CARD_ID = 'B94_StockProtector'

export const B94_StockProtector = new Occupation({
  id: CARD_ID,
  name: "Stock Protector",
  deck: "B",
  number: 94,
  category: "ACTIONS_BOOSTER",
  desc: ["Each time before you use the __Fencing__ action space, you get 2 <WOOD>. Immediately after that __Fencing__ action, you can place another person."],
  cost: {},
  players: "1+",
  newSet: true,
})
