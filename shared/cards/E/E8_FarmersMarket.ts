import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E8_FarmersMarket'

registerCardEffect({
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'gain',
    sourceCard: CARD_ID,
    params: { vegetable: 1 },
  }),
})

export const E8_FarmersMarket = new MinorImprovement({
  id: CARD_ID,
  name: "Farmer's Market",
  deck: 'E',
  number: 8,
  category: 'FOOD_MISC',
  desc: ['You immediately get 1 <VEGETABLE>. (Effectively, you are buying 1 <VEGETABLE> for 2 <FOOD>.)'],
  cost: { food: 2 },
  passing: true,
})
