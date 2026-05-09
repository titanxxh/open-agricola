import type { CardImpl } from '../registry'
import { A8_FoodBasket } from '../../cards-display/A/A8_FoodBasket'

const CARD_ID = A8_FoodBasket.id

export const A8_FoodBasket_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'gain',
    sourceCard: CARD_ID,
    params: { grain: 1, vegetable: 1 },
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
