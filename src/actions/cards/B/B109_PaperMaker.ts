import { Occupation } from '../types'

export const B109_PaperMaker = new Occupation({
  id: "B109_PaperMaker",
  name: "Paper Maker",
  deck: "B",
  number: 109,
  category: "FOOD_PROVIDER",
  desc: ["Immediately before playing each occupation after this one, you can pay 1 <WOOD> total to get 1 <FOOD> for each occupation you have in front of you."],
  cost: {},
  players: "1+",
})
