import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'
import { D41_HorseDrawnBoat } from '../../cards-display/D/D41_HorseDrawnBoat'

const CARD_ID = D41_HorseDrawnBoat.id

export const D41_HorseDrawnBoat_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    // Alternate placing 1 food and 1 sheep on remaining round spaces starting with food
    // food on rounds +1, +3, +5, +7, +9, +11, +13 (relative offsets)
    // sheep on rounds +2, +4, +6, +8, +10, +12
    const foodOffsets = [1, 3, 5, 7, 9, 11, 13]
    const sheepOffsets = [2, 4, 6, 8, 10, 12]

    const foodEntries = foodOffsets
      .map((offset) => ({ round: state.round + offset, resources: { food: 1 } }))
      .filter((e) => e.round <= 14)

    const sheepEntries = sheepOffsets
      .map((offset) => ({ round: state.round + offset, resources: { sheep: 1 } }))
      .filter((e) => e.round <= 14)

    if (foodEntries.length > 0) {
      queueFutureMeeples(state, {
        cardId: CARD_ID,
        playerId: player.id,
        entries: foodEntries,
      })
    }
    if (sheepEntries.length > 0) {
      queueFutureMeeples(state, {
        cardId: CARD_ID,
        playerId: player.id,
        entries: sheepEntries,
      })
    }
    return futureMeeplesNode()
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
