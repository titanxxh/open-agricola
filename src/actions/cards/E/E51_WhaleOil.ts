import { MinorImprovement } from '../types'

export const E51_WhaleOil = new MinorImprovement({
  id: "E51_WhaleOil",
  name: "Whale Oil",
  deck: "E",
  number: 51,
  category: "FOOD",
  desc: ["Each time you use __Fishing__, place 1 <FOOD> from the general supply on this card. Each time before you play an occupation, you get <FOOD> equal to the amount on this card."],
  cost: {"wood":1},
})
