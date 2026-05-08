import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { C65_Granary } from '../../cards-display/C/C65_Granary'

const CARD_ID = C65_Granary.id

export const C65_Granary_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const targetRounds = [8, 10, 12].filter((r) => r > state.round)
    if (targetRounds.length === 0) return
    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: targetRounds.map((round) => ({ round, resources: { grain: 1 } })),
    })
    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
