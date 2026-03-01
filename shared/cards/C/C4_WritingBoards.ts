import { MinorImprovement } from '../types'

export const C4_WritingBoards = new MinorImprovement({
  id: "C4_WritingBoards",
  name: "Writing Boards",
  deck: "C",
  number: 4,
  category: "ACTIONS_BOOSTER",
  desc: ["At the end of the game, you get 1 <SCORE> for each improvement and occupation card you have played."],
  cost: { wood: 2 },
  passing: true,
})
