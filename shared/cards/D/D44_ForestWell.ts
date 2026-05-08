import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { D44_ForestWell } from '../../cards-display/D/D44_ForestWell'
export { D44_ForestWell }

const CARD_ID = D44_ForestWell.id

export const D44_ForestWell_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    // Place 1 food on each remaining round space, up to the amount of wood in supply
    const n = player.resources.wood ?? 0
    if (n === 0) return
    const entries = Array.from({ length: n }, (_, i) => ({
      round: state.round + 1 + i,
      resources: { food: 1 },
    })).filter((e) => e.round <= 14)

    if (entries.length === 0) return
    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries,
    })
    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
