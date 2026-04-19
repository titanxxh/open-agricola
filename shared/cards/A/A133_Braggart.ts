import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'A133_Braggart'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const count = player.improvements.length + player.minorPlayed.length
    if (count >= 10) return 9
    if (count >= 9) return 7
    if (count >= 8) return 5
    if (count >= 7) return 4
    if (count >= 6) return 3
    if (count >= 5) return 2
    return 0
  },
})

export const A133_Braggart = new Occupation({
  id: CARD_ID,
  name: "Braggart",
  deck: "A",
  number: 133,
  category: "POINTS_PROVIDER",
  desc: ["During the scoring, you get 2/3/4/5/7/9 bonus <SCORE> for having at least 5/6/7/8/9/10 improvements in front of you."],
  cost: {},
  players: "1+",
})
