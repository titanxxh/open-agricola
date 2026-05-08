import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'
import { B74_ThickForest } from '../../cards-display/B/B74_ThickForest'

const CARD_ID = B74_ThickForest.id

registerPrerequisite('5 Clay in Your Supply', (player) => (player.resources.clay ?? 0) >= 5)

export const B74_ThickForest_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const evenRounds = [2, 4, 6, 8, 10, 12, 14].filter((r) => r > state.round)
    if (evenRounds.length === 0) return
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: evenRounds.map((round) => ({ round, resources: { wood: 1 } })),
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
