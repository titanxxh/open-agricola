import { MinorImprovement } from '../types'

export const A40_PottersYard = new MinorImprovement({
  id: "A40_PottersYard",
  name: "A40_PottersYard",
  deck: "A",
  number: 40,
  category: "GOODS_PROVIDER",
  desc: [],
  cost: {"wood":1,"reed":1},
  prerequisite: "At Most 7 Unused Farmyard Spaces",
})
