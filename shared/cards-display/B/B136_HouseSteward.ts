import { Occupation } from '../types'

const CARD_ID = 'B136_HouseSteward'

export const B136_HouseSteward = new Occupation({
  id: CARD_ID,
  name: "House Steward",
  deck: "B",
  number: 136,
  category: "POINTS_PROVIDER",
  desc: ["If there are still 1/3/6/9 complete rounds left to play, you immediately get 1/2/3/4 <WOOD>. During scoring, each player with the most rooms gets 3 bonus <SCORE>."],
  cost: {},
  players: "3+",
  extraVp: true,
})
