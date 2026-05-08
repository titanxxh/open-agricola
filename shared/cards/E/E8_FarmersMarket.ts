import type { CardImpl } from '../registry'
import { E8_FarmersMarket } from '../../cards-display/E/E8_FarmersMarket'
export { E8_FarmersMarket }

const CARD_ID = E8_FarmersMarket.id

export const E8_FarmersMarket_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'gain',
    sourceCard: CARD_ID,
    params: { vegetable: 1 },
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
