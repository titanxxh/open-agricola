import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'
import { E43_BarnCats } from '../../cards-display/E/E43_BarnCats'
export { E43_BarnCats }

const CARD_ID = E43_BarnCats.id

registerPrerequisite('1 Stable', (player) => player.stableTiles.length >= 1)

export const E43_BarnCats_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const stables = player.stableTiles.length
    if (stables === 0) return

    // 1 stable → 2 rounds, 2 → 3, 3 → 4, 4 → 5
    const count = Math.min(stables + 1, 5)

    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count,
      resources: { food: 1 },
    })
    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
