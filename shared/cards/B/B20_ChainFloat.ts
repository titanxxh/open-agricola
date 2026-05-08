import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { B20_ChainFloat } from '../../cards-display/B/B20_ChainFloat'
export { B20_ChainFloat }

const CARD_ID = B20_ChainFloat.id

export const B20_ChainFloat_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const base = state.round
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [
        { round: base + 7, resources: {} },
        { round: base + 8, resources: {} },
        { round: base + 9, resources: {} },
      ],
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
