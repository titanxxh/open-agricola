import { Occupation } from '../types'

export const A89_StablePlanner = new Occupation({
  id: "A89_StablePlanner",
  name: "Stable Planner",
  deck: "A",
  number: 89,
  category: "FARM_PLANNER",
  desc: ["Add 3, 6, and 9 to the current round. You can place 1 stable on each corresponding round space. At the start of these rounds (not earlier), you can build the stable at no cost."],
  cost: {},
  players: "1+",
  newSet: true,
})
