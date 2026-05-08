import type { CardImpl } from '../registry'
import { E6_Recount } from '../../cards-display/E/E6_Recount'
export { E6_Recount }

const CARD_ID = E6_Recount.id

export const E6_Recount_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const types: Array<[keyof typeof player.resources, string]> = [
      ['wood', 'wood'],
      ['clay', 'clay'],
      ['reed', 'reed'],
      ['stone', 'stone'],
    ]
    const gains: Partial<typeof player.resources> = {}
    for (const [key] of types) {
      if ((player.resources[key] ?? 0) >= 4) {
        gains[key] = 1
      }
    }
    if (Object.keys(gains).length === 0) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: gains,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
