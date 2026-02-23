import { MinorImprovement } from '../types'

export const A10_WoodenShed = new MinorImprovement({
  id: "A10_WoodenShed",
  name: "Wooden Shed",
  deck: "A",
  number: 10,
  category: "FARM_PLANNER",
  desc: ["This card can only be played via a __Major Improvement__ action. It provides room for one person. You may no longer renovate."],
  cost: {"wood":2,"reed":1},
  prerequisite: "Still in Wooden House",
})
