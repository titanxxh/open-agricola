import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { D40_Cesspit } from '../../cards-display/D/D40_Cesspit'
export { D40_Cesspit }

const CARD_ID = D40_Cesspit.id

export const D40_Cesspit_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    // Alternate placing 1 clay and 1 boar on remaining round spaces starting with clay
    // clay on rounds +1, +3, +5, +7, +9, +11, +13 (relative offsets from current round)
    // boar on rounds +2, +4, +6, +8, +10, +12
    const clayOffsets = [1, 3, 5, 7, 9, 11, 13]
    const boarOffsets = [2, 4, 6, 8, 10, 12]

    const clayEntries = clayOffsets
      .map((offset) => ({ round: state.round + offset, resources: { clay: 1 } }))
      .filter((e) => e.round <= 14)

    const boarEntries = boarOffsets
      .map((offset) => ({ round: state.round + offset, resources: { boar: 1 } }))
      .filter((e) => e.round <= 14)

    if (clayEntries.length > 0) {
      queueFutureMeeples(state, {
        cardId: CARD_ID,
        playerId: player.id,
        entries: clayEntries,
      })
    }
    if (boarEntries.length > 0) {
      queueFutureMeeples(state, {
        cardId: CARD_ID,
        playerId: player.id,
        entries: boarEntries,
      })
    }
    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
