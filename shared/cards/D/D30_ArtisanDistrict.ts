import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'D30_ArtisanDistrict'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return 0
    const count = player.improvements.length
    if (count >= 5) return 8
    if (count >= 4) return 5
    if (count >= 3) return 2
    return 0
  },
})

export const D30_ArtisanDistrict = new MinorImprovement({
  id: CARD_ID,
  name: "Artisan District",
  deck: "D",
  number: 30,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, you get 2/5/8 bonus <SCORE> for 3/4/5+ major improvements."],
  cost: { stone: 1 },
})
