import { MinorImprovement } from '../types'

export const C31_WritingChamber = new MinorImprovement({
  id: "C31_WritingChamber",
  name: "Writing Chamber",
  deck: "C",
  number: 31,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get a number of bonus <SCORE> equal to the total of negative points you have, to a maximum of 7 <SCORE>."],
  cost: {"wood":2},
})
