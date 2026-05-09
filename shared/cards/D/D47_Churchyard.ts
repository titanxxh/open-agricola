import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'
import { D47_Churchyard } from '../../cards-display/D/D47_Churchyard'

const CARD_ID = D47_Churchyard.id

registerPrerequisite('10 Cards* in Front of You', (player) => {
  const total =
    player.occupationPlayed.length
    + player.minorPlayed.length
    + player.improvements.length
  return total >= 10
})

export const D47_Churchyard_impl = {
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
