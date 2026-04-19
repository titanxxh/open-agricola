import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'A32_Manger'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const totalSize = player.pastures.reduce((sum, p) => sum + p.size, 0)
    if (totalSize >= 10) return 4
    if (totalSize >= 8) return 3
    if (totalSize >= 7) return 2
    if (totalSize >= 6) return 1
    return 0
  },
})

export const A32_Manger = new MinorImprovement({
  id: CARD_ID,
  name: "Manger",
  deck: "A",
  number: 32,
  category: "POINTS_PROVIDER",
  desc: ["During scoring, if your pastures cover at least 6/7/8/10 farmyard spaces, you get 1/2/3/4 bonus <SCORE>."],
  cost: { wood: 2 },
})
