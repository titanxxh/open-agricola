import { Occupation } from '../types'
import { getMajorCard } from '../major'
import type { CardImpl } from '../registry'

const CARD_ID = 'B153_Housemaster'

export const B153_Housemaster = new Occupation({
  id: CARD_ID,
  name: "Housemaster",
  deck: "B",
  number: 153,
  category: "POINTS_PROVIDER",
  desc: ['During scoring, total the base point values of your major improvements. The smallest value counts double. If the total is at least 5/7/9/11, you get 1/2/3/4 bonus <SCORE>.'],
  cost: {},
  players: "1+",
})

export const B153_Housemaster_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const majorVps = player.improvements
      .map((id) => getMajorCard(id)?.vp ?? 0)
      .filter((vp) => vp > 0)
    if (majorVps.length === 0) return 0
    const sum = majorVps.reduce((a, b) => a + b, 0)
    const min = Math.min(...majorVps)
    // A60 Oriental Fireplace (VP=1) substitutes for Fireplace; include it only
    // when the minimum base major VP is 1 (BGA-specific rule).
    const hasOriental = player.minorPlayed.includes('A60_OrientalFireplace')
    const orientalVp = hasOriental && min === 1 ? 1 : 0
    const total = sum + min + orientalVp
    if (total >= 11) return 4
    if (total >= 9) return 3
    if (total >= 7) return 2
    if (total >= 5) return 1
    return 0
  },
},
  reaches: ['A60_OrientalFireplace'] as readonly string[],
} satisfies CardImpl
