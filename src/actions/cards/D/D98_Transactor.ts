import { Occupation } from '../types'

export const D98_Transactor = new Occupation({
  id: "D98_Transactor",
  name: "Transactor",
  deck: "D",
  number: 98,
  category: "POINTS_PROVIDER",
  desc: ["Immediately before the final harvest at the end of round 14, you can take all the building resources that are left on the entire game board."],
  cost: {},
  players: "1+",
})
