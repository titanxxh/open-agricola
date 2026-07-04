import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'A001_Shelter'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'stables',
    sourceCard: CARD_ID,
    optional: true,
    actionContext: {
      max: 1,
      exactCost: { wood: 0 },
      zoneFilter: 'pasture-1',
    },
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A001_Shelter = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Shelter',
    deck: 'A',
    number: 1,
    category: 'FARM_PLANNER',
    desc: ['You can immediately build a <STABLE> at no cost, but only if you place it in a pasture covering exactly 1 farmyard space.'],
    passing: true,
  },
  impl: cardImpl,
})

export const A001_Shelter_impl = A001_Shelter.impl
