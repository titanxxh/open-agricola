import { Occupation } from '../types'

const CARD_ID = 'A136_DrudgeryReeve'

export const A136_DrudgeryReeve = new Occupation({
  id: CARD_ID,
  name: "Drudgery Reeve",
  deck: "A",
  number: 136,
  category: "POINTS_PROVIDER",
  desc: ["If there are still 1/3/6/9 complete rounds left to play, you immediately get 1/2/3/4 <WOOD>. During scoring, each player with 1+/2+/3+ building resources of each type gets 1/3/5 bonus <SCORE>."],
  cost: {},
  players: "3+",
  extraVp: true,
})
