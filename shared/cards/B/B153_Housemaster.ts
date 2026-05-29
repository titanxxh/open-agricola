import type { CardImpl } from '../registry'
import { B153_Housemaster } from '../../cards-display/B/B153_Housemaster'
import { collectCardDefinitionsAs } from '../helpers/card-type'

const CARD_ID = B153_Housemaster.id

export const B153_Housemaster_impl = {
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player) => {
      const majorVps = collectCardDefinitionsAs(player, 'major')
        .map((def) => def.vp ?? 0)
        .filter((vp) => vp > 0)
      if (majorVps.length === 0) return 0
      const sum = majorVps.reduce((a, b) => a + b, 0)
      const min = Math.min(...majorVps)
      const total = sum + min
      if (total >= 11) return 4
      if (total >= 9) return 3
      if (total >= 7) return 2
      if (total >= 5) return 1
      return 0
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
