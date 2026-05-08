import { Occupation } from '../types'

const CARD_ID = 'D152_Patron'

export const D152_Patron = new Occupation({
  id: CARD_ID,
  name: "Patron",
  deck: "D",
  number: 152,
  category: "ACTIONS_BOOSTER",
  desc: ['Immediately before each time you play an occupation after this one (even before paying the occupation cost), you get 2 <FOOD>.'],
  cost: {},
  players: "4+",
})
