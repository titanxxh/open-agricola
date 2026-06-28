import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'D002_DwellingPlan'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'seq' as const,
      optional: true,
      children: [
        {
          type: 'leaf' as const,
          actionId: 'renovate-house',
          sourceCard: CARD_ID,
        },
      ],
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D002_DwellingPlan = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Dwelling Plan',
    deck: 'D',
    number: 2,
    category: 'FARM_PLANNER',
    desc: ['You can immediately take a __Renovation__ action.'],
    cost: { food: 1 },
    passing: true,
  },
  impl: cardImpl,
})

export const D002_DwellingPlan_impl = D002_DwellingPlan.impl
