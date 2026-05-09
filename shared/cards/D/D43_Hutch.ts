import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { D43_Hutch } from '../../cards-display/D/D43_Hutch'

const CARD_ID = D43_Hutch.id

export const D43_Hutch_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    // Place 0, 1, 2, 3 food on next 4 round spaces (rounds +1 gets 0, +2 gets 1, +3 gets 2, +4 gets 3)
    // Round +1 gets 0 food (nothing to queue), +2 gets 1, +3 gets 2, +4 gets 3
    const entries = [
      { round: state.round + 2, resources: { food: 1 } },
      { round: state.round + 3, resources: { food: 2 } },
      { round: state.round + 4, resources: { food: 3 } },
    ].filter((e) => e.round <= 14)

    if (entries.length > 0) {
      queueFutureMeeples(state, {
        cardId: CARD_ID,
        playerId: player.id,
        entries,
      })
    }
    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
