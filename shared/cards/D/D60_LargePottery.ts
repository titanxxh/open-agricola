import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'D60_LargePottery'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return 0
    const clay = player.resources.clay
    if (clay >= 7) return 4
    if (clay >= 6) return 3
    if (clay >= 5) return 2
    if (clay >= 3) return 1
    return 0
  },
})

export const D60_LargePottery = new MinorImprovement({
  id: CARD_ID,
  name: "Large Pottery",
  deck: "D",
  number: 60,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1/2/3/4 bonus <SCORE> for 3-4/5/6/7+ clay."],
  cost: { clay: 2 },
})
