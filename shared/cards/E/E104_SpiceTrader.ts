import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { E104_SpiceTrader } from '../../cards-display/E/E104_SpiceTrader'
export { E104_SpiceTrader }

const CARD_ID = E104_SpiceTrader.id

export const E104_SpiceTrader_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    if (state.round >= 5) return
    if (11 <= state.round) return

    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [{ round: 11, resources: { vegetable: 3 } }],
    })
    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
