import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'A1_Shelter'

// BGA: build 1 stable at no cost, restricted to single-space pastures.
// Simplified: offer free stables action (zone restriction not enforced in TS).
registerCardEffect({
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'stables',
    sourceCard: CARD_ID,
    optional: true,
  }),
})

export const A1_Shelter = new MinorImprovement({
  id: CARD_ID,
  name: 'Shelter',
  deck: 'A',
  number: 1,
  category: 'FARM_PLANNER',
  desc: ['You can immediately build a stable at no cost, but only if you place it in a pasture covering exactly 1 farmyard space.'],
  cost: { wood: 0 },
  passing: true,
})
