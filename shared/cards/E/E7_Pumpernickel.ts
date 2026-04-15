import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'E7_Pumpernickel'

registerCardEffect({
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'gain',
    sourceCard: CARD_ID,
    params: { food: 4 },
  }),
})

export const E7_Pumpernickel = new MinorImprovement({
  id: CARD_ID,
  name: 'Pumpernickel',
  deck: 'E',
  number: 7,
  category: 'FOOD_GRAIN',
  desc: ['You immediately get 4 <FOOD>. (Effectively, you are turning 1 <GRAIN> into 4 <FOOD>.)'],
  cost: { grain: 1 },
  passing: true,
})
