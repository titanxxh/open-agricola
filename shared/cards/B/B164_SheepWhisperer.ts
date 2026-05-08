import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { B164_SheepWhisperer } from '../../cards-display/B/B164_SheepWhisperer'
export { B164_SheepWhisperer }

const CARD_ID = B164_SheepWhisperer.id

export const B164_SheepWhisperer_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const base = state.round
    const entries = [base + 2, base + 5, base + 8, base + 10]
      .filter((r) => r <= 14)
      .map((round) => ({ round, resources: { sheep: 1 } }))
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
