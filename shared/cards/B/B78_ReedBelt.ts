import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { B78_ReedBelt } from '../../cards-display/B/B78_ReedBelt'

const CARD_ID = B78_ReedBelt.id

export const B78_ReedBelt_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const targetRounds = [5, 8, 10, 12].filter((r) => r > state.round)
    if (targetRounds.length === 0) return
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: targetRounds.map((round) => ({ round, resources: { reed: 1 } })),
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
