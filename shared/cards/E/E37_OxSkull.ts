import type { CardImpl } from '../registry'
import { E37_OxSkull } from '../../cards-display/E/E37_OxSkull'

const CARD_ID = E37_OxSkull.id

export const E37_OxSkull_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    return player.resources.cattle === 0 ? 3 : 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
