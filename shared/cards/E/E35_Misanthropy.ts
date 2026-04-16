import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E35_Misanthropy'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return 0
    if (player.familySize === 2) return 5
    if (player.familySize === 3) return 3
    if (player.familySize === 4) return 2
    return 0
  },
})

export const E35_Misanthropy = new MinorImprovement({
  id: CARD_ID,
  name: "Misanthropy",
  deck: "E",
  number: 35,
  category: "POINTS_PROVIDER",
  desc: ['During scoring, if you have exactly 4/3/2 people, you get 2/3/5 bonus <SCORE>.'],
  cost: {},
  vp: 0,
})
