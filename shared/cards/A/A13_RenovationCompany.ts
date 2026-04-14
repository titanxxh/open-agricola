import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'A13_RenovationCompany'

// BGA: gain 3 clay, then optionally renovate at no cost.
// Simplified: gain 3 clay + optional renovate-house (standard cost still applies;
// the free cost override requires engine-level support not yet available).
registerCardEffect({
  id: CARD_ID,
  onBuy: () => ({
    type: 'seq' as const,
    children: [
      {
        type: 'leaf' as const,
        actionId: 'gain',
        sourceCard: CARD_ID,
        params: { clay: 3 },
      },
      {
        type: 'leaf' as const,
        actionId: 'renovate-house',
        sourceCard: CARD_ID,
        optional: true,
      },
    ],
  }),
})

export const A13_RenovationCompany = new MinorImprovement({
  id: CARD_ID,
  name: 'Renovation Company',
  deck: 'A',
  number: 13,
  category: 'FARM_PLANNER',
  desc: ['When you play this card, you immediately get 3 <CLAY>. Immediately after, you can renovate without paying any building resources.'],
  cost: { wood: 4 },
  prerequisite: 'In Wooden House with Exactly 2 Rooms',
  newSet: true,
})
