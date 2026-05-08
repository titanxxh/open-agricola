import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { C166_CattleWhisperer } from '../../cards-display/C/C166_CattleWhisperer'
export { C166_CattleWhisperer }

const CARD_ID = C166_CattleWhisperer.id

export const C166_CattleWhisperer_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const offsets = [5, 8]
    const entries = offsets
      .map((offset) => ({ round: state.round + offset, resources: { cattle: 1 } }))
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
