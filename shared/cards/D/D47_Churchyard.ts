import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { D47_Churchyard } from '../../cards-display/D/D47_Churchyard'

const CARD_ID = D47_Churchyard.id

export const D47_Churchyard_impl = {
  prerequisiteCheck: (player) => {
    const total =
      player.occupationPlayed.length
      + player.minorPlayed.length
      + player.improvements.length
    return total >= 10
  },
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    // Place 2 food on each remaining round space (all remaining rounds up to 14)
    const count = 14 - state.round
    if (count <= 0) return
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count,
      resources: { food: 2 },
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
