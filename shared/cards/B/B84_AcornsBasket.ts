import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { B84_AcornsBasket } from '../../cards-display/B/B84_AcornsBasket'
export { B84_AcornsBasket }

const CARD_ID = B84_AcornsBasket.id

export const B84_AcornsBasket_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count: 2,
      resources: { boar: 1 },
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
