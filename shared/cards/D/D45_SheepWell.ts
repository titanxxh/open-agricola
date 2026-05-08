import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { D45_SheepWell } from '../../cards-display/D/D45_SheepWell'
export { D45_SheepWell }

const CARD_ID = D45_SheepWell.id

export const D45_SheepWell_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    // Place 1 food on each of the next round spaces, up to the number of sheep you have
    const n = player.resources.sheep ?? 0
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
