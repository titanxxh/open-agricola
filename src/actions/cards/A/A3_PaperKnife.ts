import { MinorImprovement } from '../types'

export const A3_PaperKnife = new MinorImprovement({
  id: "A3_PaperKnife",
  name: "Paper Knife",
  deck: "A",
  number: 3,
  category: "ACTIONS_BOOSTER",
  desc: ["Select 3 occupations in your hand. Select one of them randomly, which you can play immediately without paying an occupation cost."],
  cost: {"wood":1},
  passing: true,
})
