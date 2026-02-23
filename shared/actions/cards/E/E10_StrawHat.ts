import { MinorImprovement } from '../types'

export const E10_StrawHat = new MinorImprovement({
  id: "E10_StrawHat",
  name: "Straw Hat",
  deck: "E",
  number: 10,
  desc: ["At the end of the work phases of rounds 3 and 6, you can move your person from the __Farmland__ action space to an unoccupied action space and take that action, or get 1 <FOOD>."],
  cost: {"reed":1},
})
