import { MinorImprovement } from '../types'
import { familySize } from '../../game/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'E35_Misanthropy'

export const E35_Misanthropy = new MinorImprovement({
  id: CARD_ID,
  name: "Misanthropy",
  deck: "E",
  number: 35,
  category: "BONUS_POINTS_-_GET",
  desc: ['During scoring, if you have exactly 4/3/2 people, you get 2/3/5 bonus <SCORE>.'],
  cost: {},
  vp: 0,
})

export const E35_Misanthropy_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const size = familySize(player)
    if (size === 2) return 5
    if (size === 3) return 3
    if (size === 4) return 2
    return 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
