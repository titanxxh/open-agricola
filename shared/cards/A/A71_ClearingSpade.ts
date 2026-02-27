import { MinorImprovement } from '../types'

export const A71_ClearingSpade = new MinorImprovement({
  id: "A71_ClearingSpade",
  name: "Clearing Spade",
  deck: "A",
  number: 71,
  category: "CROP_PROVIDER",
  desc: ["At any time, you can move 1 crop from a planted field containing at least 2 crops to an empty field."],
  cost: {"wood":1},
})
