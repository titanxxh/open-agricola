import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { B66_SackCart } from '../../cards-display/B/B66_SackCart'
export { B66_SackCart }

const CARD_ID = B66_SackCart.id

export const B66_SackCart_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [
        { round: 5, resources: { grain: 1 } },
        { round: 8, resources: { grain: 1 } },
        { round: 11, resources: { grain: 1 } },
        { round: 14, resources: { grain: 1 } },
      ].filter((e) => e.round > state.round),
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
