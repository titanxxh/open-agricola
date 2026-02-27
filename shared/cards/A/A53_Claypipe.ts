import { MinorImprovement } from '../types'

export const A53_Claypipe = new MinorImprovement({
  id: "A53_Claypipe",
  name: "Claypipe",
  deck: "A",
  number: 53,
  category: "FOOD_PROVIDER",
  desc: ["In the returning home phase of each round, if you gained at least 7 building resources in the preceding work phase, you get 2 <FOOD>."],
  cost: {"clay":1},
})
