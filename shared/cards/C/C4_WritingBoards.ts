import { MinorImprovement } from '../types'

export const C4_WritingBoards = new MinorImprovement({
  id: "C4_WritingBoards",
  name: "Writing Boards",
  deck: "C",
  number: 4,
  category: "ACTIONS_BOOSTER",
  desc: ["You immediately get 1 <WOOD> for each occupation you have in front of you."],
  cost: { wood: 2 },
  passing: true,
  implemented: false,
})
