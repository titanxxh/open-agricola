import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'A1_Shelter'

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

export const A1_Shelter_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'stables',
    sourceCard: CARD_ID,
    optional: true,
    actionContext: {
      max: 1,
      costOverride: { wood: -99 },
      zoneFilter: 'pasture-1',
    },
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
