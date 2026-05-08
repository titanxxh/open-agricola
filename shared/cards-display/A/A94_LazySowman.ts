import { Occupation } from '../types'

const CARD_ID = 'A94_LazySowman'

export const A94_LazySowman = new Occupation({
  id: CARD_ID,
  name: "Lazy Sowman",
  deck: "A",
  number: 94,
  category: "ACTIONS_BOOSTER",
  desc: ["Each time you decline an unconditional __Sow__ action on your turn, you can immediately place another person on an action space of your choice (even if it is occupied)."],
  cost: {},
  players: "1+",
})
