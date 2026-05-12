import { Occupation } from '../types'

const CARD_ID = 'C136_RanchProvost'

export const C136_RanchProvost = new Occupation({
  id: CARD_ID,
  name: "Ranch Provost",
  deck: "C",
  number: 136,
  category: "POINTS_PROVIDER",
  desc: ["If there are still 3/6/9 complete rounds left to play, you immediately get 2/3/4 <WOOD>. During scoring, each player with a pasture of highest capacity gets 3 bonus <SCORE>."],
  players: "3+",
  extraVp: true,
})
