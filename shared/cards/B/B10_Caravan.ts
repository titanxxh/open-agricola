import { MinorImprovement } from '../types'

export const B10_Caravan = new MinorImprovement({
  id: "B10_Caravan",
  name: "Caravan",
  deck: "B",
  number: 10,
  category: "FARM_PLANNER",
  desc: ["This card provides room for 1 person."],
  cost: {"wood":3,"food":3},
})
