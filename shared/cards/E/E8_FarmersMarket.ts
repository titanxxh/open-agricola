import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'E8_FarmersMarket'

const cardImpl = {
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

export const E8_FarmersMarket = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Farmer's Market",
    deck: 'E',
    number: 8,
    category: 'PASSING_-_CROP',
    desc: ['You immediately get 1 <VEGETABLE>. (Effectively, you are buying 1 <VEGETABLE> for 2 <FOOD>.)'],
    cost: { food: 2 },
    passing: true,
  },
  impl: cardImpl,
})

export const E8_FarmersMarket_impl = E8_FarmersMarket.impl
