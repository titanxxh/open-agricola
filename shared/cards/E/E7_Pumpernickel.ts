import type { CardImpl } from '../registry'
import { E7_Pumpernickel } from '../../cards-display/E/E7_Pumpernickel'

const CARD_ID = E7_Pumpernickel.id

export const E7_Pumpernickel_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'gain',
    sourceCard: CARD_ID,
    params: { food: 4 },
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
