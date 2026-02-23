import { MinorImprovement } from '../types'

export const D53_TeaHouse = new MinorImprovement({
  id: "D53_TeaHouse",
  name: "Tea House",
  deck: "D",
  number: 53,
  category: "FOOD_PROVIDER",
  desc: ["Once per round, you can skip placing your second person and get 1 <FOOD> instead. (You can place the person later that round.)"],
  cost: {"wood":1,"stone":1},
  prerequisite: "Play in Round 6 or Later",
})
