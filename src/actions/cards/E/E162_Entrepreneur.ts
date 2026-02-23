import { Occupation } from '../types'

export const E162_Entrepreneur = new Occupation({
  id: "E162_Entrepreneur",
  name: "Entrepreneur",
  deck: "E",
  number: 162,
  desc: ["At the start of each round, you can move 1 <FOOD> to this card or discard 1 <FOOD> from it. If you do either, you get 1 building resource of a type you currently do not have."],
  cost: {},
  players: "4+",
})
