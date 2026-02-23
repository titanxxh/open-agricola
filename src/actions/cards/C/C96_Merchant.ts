import { Occupation } from '../types'

export const C96_Merchant = new Occupation({
  id: "C96_Merchant",
  name: "Merchant",
  deck: "C",
  number: 96,
  category: "ACTIONS_BOOSTER",
  desc: ["Immediately after each time you take a __Major or Minor Improvement__ or __Minor Improvement__ action, you can pay 1 <FOOD> to take the action a second time."],
  cost: {},
  players: "1+",
})
