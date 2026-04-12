import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'D38_MilkingStool'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return 0
    return Math.floor(player.resources.cattle / 2)
  },
})

export const D38_MilkingStool = new MinorImprovement({
  id: CARD_ID,
  name: "Milking Stool",
  deck: "D",
  number: 38,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 1 bonus <SCORE> for every 2 cattle."],
  cost: { wood: 1 },
})
