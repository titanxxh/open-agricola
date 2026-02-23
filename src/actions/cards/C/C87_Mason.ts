import { Occupation } from '../types'

export const C87_Mason = new Occupation({
  id: "C87_Mason",
  name: "Mason",
  deck: "C",
  number: 87,
  category: "FARM_PLANNER",
  desc: ["Place a stone room on this card. Once you have a stone house with at least 4 rooms, at any time, you can add that room without paying any building resources."],
  cost: {},
  players: "1+",
})
