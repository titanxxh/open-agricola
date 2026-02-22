import { MinorImprovement } from '../types'

export const C29_BeerTable = new MinorImprovement({
  id: "C29_BeerTable",
  name: "Beer Table",
  deck: "C",
  number: 29,
  category: "POINTS_PROVIDER",
  desc: [],
  cost: {"wood":2},
  prerequisite: "No Grain in Your Supply",
  newSet: true,
})
