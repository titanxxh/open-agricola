import { MinorImprovement } from '../types'

export const A136_DrudgeryReeve = new MinorImprovement({
  id: "A136_DrudgeryReeve",
  name: "Drudgery Reeve",
  deck: "A",
  number: 136,
  category: "POINTS_PROVIDER",
  desc: ["If there are still 1/3/6/9 complete rounds left to play, you immediately get 1/2/3/4 <WOOD>. During scoring, each player with 1+/2+/3+ building resources of each type gets 1/3/5 bonus <SCORE>."],
  cost: {},
  players: "3+",
})
