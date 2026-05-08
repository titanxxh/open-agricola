import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import { getFenceCount } from '../../actions/effects/fencing'
import type { CardImpl } from '../registry'
import { A47_Trellises } from '../../cards-display/A/A47_Trellises'
export { A47_Trellises }

const CARD_ID = A47_Trellises.id

export const A47_Trellises_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const n = getFenceCount(player)
    if (n <= 0) return
    return queueFutureMeeplesFlow(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count: n,
      resources: { food: 1 },
    })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
