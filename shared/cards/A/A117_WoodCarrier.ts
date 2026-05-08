import type { CardImpl } from '../registry'
import { A117_WoodCarrier } from '../../cards-display/A/A117_WoodCarrier'

const CARD_ID = A117_WoodCarrier.id

export const A117_WoodCarrier_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    // countAllImprovements in BGA = major + minor improvements
    const n = player.improvements.length + player.minorPlayed.length
    if (n <= 0) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { wood: n },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
