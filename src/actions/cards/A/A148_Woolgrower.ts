import { Occupation } from '../types'

export const A148_Woolgrower = new Occupation({
  id: "A148_Woolgrower",
  name: "Woolgrower",
  deck: "A",
  number: 148,
  category: "FARM_PLANNER",
  desc: ["This card can hold a number of <SHEEP> equal to the number of completed feeding phases."],
  cost: {},
  players: "4+",
  newSet: true,
})
