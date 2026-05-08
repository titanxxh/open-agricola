import type { CardImpl } from '../registry'
import { E65_Almsbag } from '../../cards-display/E/E65_Almsbag'

const CARD_ID = E65_Almsbag.id

export const E65_Almsbag_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state) => {
    // 1 grain for every 2 completed rounds: floor((round - 1) / 2)
    const grainCount = Math.floor((state.round - 1) / 2)
    if (grainCount <= 0) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { grain: grainCount },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
