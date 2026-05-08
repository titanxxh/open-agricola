import type { CardImpl } from '../registry'
import { A32_Manger } from '../../cards-display/A/A32_Manger'
export { A32_Manger }

const CARD_ID = A32_Manger.id

export const A32_Manger_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const totalSize = player.pastures.reduce((sum, p) => sum + p.size, 0)
    if (totalSize >= 10) return 4
    if (totalSize >= 8) return 3
    if (totalSize >= 7) return 2
    if (totalSize >= 6) return 1
    return 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
