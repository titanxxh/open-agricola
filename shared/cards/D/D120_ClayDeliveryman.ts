import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { D120_ClayDeliveryman } from '../../cards-display/D/D120_ClayDeliveryman'

const CARD_ID = D120_ClayDeliveryman.id

export const D120_ClayDeliveryman_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    // Place 1 clay on each remaining space for rounds 6 to 14
    const absoluteRounds = [6, 7, 8, 9, 10, 11, 12, 13, 14]
    const entries = absoluteRounds
      .filter((r) => r > state.round)
      .map((round) => ({ round, resources: { clay: 1 } }))

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
