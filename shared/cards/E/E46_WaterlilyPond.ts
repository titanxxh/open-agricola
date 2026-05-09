import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { E46_WaterlilyPond } from '../../cards-display/E/E46_WaterlilyPond'

const CARD_ID = E46_WaterlilyPond.id

export const E46_WaterlilyPond_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const count = Math.min(2, 14 - state.round)
    if (count <= 0) return

    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count,
      resources: { food: 1 },
    })
    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
