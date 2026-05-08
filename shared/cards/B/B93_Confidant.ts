import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B93_Confidant } from '../../cards-display/B/B93_Confidant'

const CARD_ID = B93_Confidant.id

export const B93_Confidant_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const max = Math.min(14 - state.round, 4)
    const count = Math.max(2, max)
    return {
      type: 'seq' as const,
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: count } }),
        queueFutureMeeplesFlow(state, {
          cardId: CARD_ID,
          playerId: player.id,
          startRound: state.round + 1,
          count,
          resources: { food: 1 },
        }),
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
