import { MinorImprovement } from '../types'

export const B42_ForestInn = new MinorImprovement({
  id: "B42_ForestInn",
  name: "Forest Inn",
  deck: "B",
  number: 42,
  category: "GOODS_PROVIDER",
  desc: [],
  cost: {"clay":1,"reed":1},
  prerequisite: "Play in Round 6 or Before",
  newSet: true,
})
