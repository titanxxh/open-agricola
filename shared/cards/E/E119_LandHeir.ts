import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { E119_LandHeir } from '../../cards-display/E/E119_LandHeir'
export { E119_LandHeir }

const CARD_ID = E119_LandHeir.id

export const E119_LandHeir_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    if (state.round > 4) return

    const targetRound = 9
    if (targetRound <= state.round) return

    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [
        { round: targetRound, resources: { wood: 4 } },
        { round: targetRound, resources: { clay: 4 } },
      ],
    })
    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
