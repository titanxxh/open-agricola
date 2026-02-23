import { MinorImprovement } from '../types'

export const B3_Moonshine = new MinorImprovement({
  id: "B3_Moonshine",
  name: "Moonshine",
  deck: "B",
  number: 3,
  category: "ACTIONS_BOOSTER",
  desc: ["Randomly select an occupation in your hand. Either play it for an occupation cost of 2 <FOOD>, or give it to the next player."],
  cost: {},
  passing: true,
})
