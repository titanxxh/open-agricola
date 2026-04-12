import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'D31_Storeroom'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return 0
    return Math.min(player.resources.grain, player.resources.vegetable)
  },
})

export const D31_Storeroom = new MinorImprovement({
  id: CARD_ID,
  name: "Storeroom",
  deck: "D",
  number: 31,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 bonus <SCORE> for each pair of grain and vegetable in your supply."],
  cost: { reed: 1 },
})
