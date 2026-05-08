import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { C78_ReedHattedToad } from '../../cards-display/C/C78_ReedHattedToad'

const CARD_ID = C78_ReedHattedToad.id

export const C78_ReedHattedToad_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    // Place 1 reed on rounds at offsets +5, +7, +9, +11, +13 from current round
    const offsets = [5, 7, 9, 11, 13]
    const entries = offsets
      .map((offset) => ({ round: state.round + offset, resources: { reed: 1 } }))
      .filter((e) => e.round <= 14)
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
