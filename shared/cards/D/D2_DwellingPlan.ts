import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D2_DwellingPlan'

export const D2_DwellingPlan = new MinorImprovement({
  id: CARD_ID,
  name: 'Dwelling Plan',
  deck: 'D',
  number: 2,
  category: 'FARM_PLANNER',
  desc: ['You can immediately take a __Renovation__ action.'],
  cost: { food: 1 },
  passing: true,
  newSet: true,
})

export const D2_DwellingPlan_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => ({
    type: 'seq' as const,
    optional: true,
    children: [
      {
        type: 'leaf' as const,
        actionId: 'renovation',
        sourceCard: CARD_ID,
      },
    ],
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
