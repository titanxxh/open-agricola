import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'B30_WoodPalisades'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return 0
    return player.fences
  },
})

export const B30_WoodPalisades = new MinorImprovement({
  id: CARD_ID,
  name: "Wood Palisades",
  deck: "B",
  number: 30,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 bonus <SCORE> for each fence segment you have."],
  cost: {},
  vp: 0,
})
