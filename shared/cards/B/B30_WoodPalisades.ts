import { getPalisadeCount } from '../../actions/effects/fencing'
import type { CardImpl } from '../registry'
import { B30_WoodPalisades } from '../../cards-display/B/B30_WoodPalisades'
export { B30_WoodPalisades }

const CARD_ID = B30_WoodPalisades.id

export const B30_WoodPalisades_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    return getPalisadeCount(player)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
