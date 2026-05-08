import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { D78_ReedPond } from '../../cards-display/D/D78_ReedPond'
export { D78_ReedPond }

const CARD_ID = D78_ReedPond.id

export const D78_ReedPond_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    // Place 1 reed on each of the next 3 round spaces
    const count = Math.min(3, 14 - state.round)
    if (count <= 0) return
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count,
      resources: { reed: 1 },
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
