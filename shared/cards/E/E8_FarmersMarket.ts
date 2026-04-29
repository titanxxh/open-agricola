import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E8_FarmersMarket'

export const E8_FarmersMarket = new MinorImprovement({
  id: CARD_ID,
  name: "Farmer's Market",
  deck: 'E',
  number: 8,
  category: 'PASSING_-_CROP',
  desc: ['You immediately get 1 <VEGETABLE>. (Effectively, you are buying 1 <VEGETABLE> for 2 <FOOD>.)'],
  cost: { food: 2 },
  passing: true,
})

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
