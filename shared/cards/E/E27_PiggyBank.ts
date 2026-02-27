import { MinorImprovement } from '../types'

export const E27_PiggyBank = new MinorImprovement({
  id: "E27_PiggyBank",
  name: "Piggy Bank",
  deck: "E",
  number: 27,
  desc: ["At the end of each work phase, you can place 1 <FOOD> on this card, irretrievably. At any time, you can discard 6 <FOOD> from this card to build a major improvement at no cost."],
  cost: {},
})
