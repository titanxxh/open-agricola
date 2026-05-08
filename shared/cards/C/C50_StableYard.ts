import type { CardImpl } from '../registry'
import { C50_StableYard } from '../../cards-display/C/C50_StableYard'

const CARD_ID = C50_StableYard.id

export const C50_StableYard_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, _player) => {
    const n = 14 - state.round
    if (n <= 0) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { food: n },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
