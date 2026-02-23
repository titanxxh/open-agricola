import { Occupation } from '../types'

export const A85_Homekeeper = new Occupation({
  id: "A85_Homekeeper",
  name: "Homekeeper",
  deck: "A",
  number: 85,
  category: "FARM_PLANNER",
  desc: ["Exactly one clay or stone room in your house can hold an additional person if the room is adjacent to both a field and a pasture."],
  cost: {},
  players: "1+",
})
