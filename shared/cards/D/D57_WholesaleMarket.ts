import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { D57_WholesaleMarket } from '../../cards-display/D/D57_WholesaleMarket'

const CARD_ID = D57_WholesaleMarket.id

export const D57_WholesaleMarket_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    // Place 1 food on each remaining round space (all remaining rounds up to 14)
    const count = 14 - state.round
    if (count <= 0) return
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count,
      resources: { food: 1 },
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
