import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { A69_LargeGreenhouse } from '../../cards-display/A/A69_LargeGreenhouse'

const CARD_ID = A69_LargeGreenhouse.id

export const A69_LargeGreenhouse_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const offsets = [4, 7, 9]
    const entries = offsets
      .map((offset) => ({ round: state.round + offset, resources: { vegetable: 1 } }))
      .filter((e) => e.round <= 14)
    if (entries.length === 0) return
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries,
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
