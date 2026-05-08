import { MinorImprovement } from '../types'

export const C29_BeerTable = new MinorImprovement({
  id: "C29_BeerTable",
  name: "Beer Table",
  deck: "C",
  number: 29,
  category: "POINTS_PROVIDER",
  desc: ["At the end of the field phase of each harvest, you can pay 1 <GRAIN> from your supply to get 2 bonus <SCORE>. If you do, all other players get 1 <FOOD> each."],
  cost: {"wood":2},
  prerequisite: "No Grain in Your Supply",
  newSet: true,
})
