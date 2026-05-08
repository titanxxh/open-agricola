import type { CardImpl } from '../registry'
import { A133_Braggart } from '../../cards-display/A/A133_Braggart'
export { A133_Braggart }

const CARD_ID = A133_Braggart.id

export const A133_Braggart_impl = {
  effect: {
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
},
  reaches: [] as readonly string[],
} satisfies CardImpl
