import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { B44_ChickStable } from '../../cards-display/B/B44_ChickStable'

const CARD_ID = B44_ChickStable.id

export const B44_ChickStable_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const base = state.round
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [
        { round: base + 3, resources: { food: 2 } },
        { round: base + 4, resources: { food: 2 } },
      ],
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
