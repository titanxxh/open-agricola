import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { E44_FodderBeets } from '../../cards-display/E/E44_FodderBeets'

const CARD_ID = E44_FodderBeets.id

export const E44_FodderBeets_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const oddRounds = [3, 5, 7, 9, 11, 13].filter((r) => r > state.round)
    if (oddRounds.length === 0) return

    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: oddRounds.map((round) => ({ round, resources: { food: 1 } })),
    })
    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
