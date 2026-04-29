import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E7_Pumpernickel'

export const E7_Pumpernickel = new MinorImprovement({
  id: CARD_ID,
  name: 'Pumpernickel',
  deck: 'E',
  number: 7,
  category: 'PASSING_-_FOOD',
  desc: ['You immediately get 4 <FOOD>. (Effectively, you are turning 1 <GRAIN> into 4 <FOOD>.)'],
  cost: { grain: 1 },
  passing: true,
})

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
