import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'C135_Constable'

registerCardEffect({
  id: CARD_ID,
  computePostScore: (_state, player, categories) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return 0
    // 3 VP if this player has no negative scoring categories
    const hasNegative = categories.some((cat) => cat.total < 0)
    return hasNegative ? 0 : 3
  },
})

export const C135_Constable = new Occupation({
  id: CARD_ID,
  name: "Constable",
  deck: "C",
  number: 135,
  category: "POINTS_PROVIDER",
  desc: ["If there are still 1/3/6/9 complete rounds left to play, you immediately get 1/2/3/4 <WOOD>. During scoring, each player with no negative points in any scoring line gets 3 bonus <SCORE>."],
  cost: {},
  players: "3+",
})
