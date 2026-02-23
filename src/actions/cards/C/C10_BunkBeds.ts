import { MinorImprovement } from '../types'

export const C10_BunkBeds = new MinorImprovement({
  id: "C10_BunkBeds",
  name: "Bunk Beds",
  deck: "C",
  number: 10,
  category: "FARM_PLANNER",
  desc: ["Once you have 4 rooms, your house can hold 5 people."],
  cost: {"wood":1},
  prerequisite: "2 Major Improvements",
})
