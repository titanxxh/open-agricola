import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E2_RenovationMaterials'

export const E2_RenovationMaterials = new MinorImprovement({
  id: CARD_ID,
  name: 'Renovation Materials',
  deck: 'E',
  number: 2,
  category: 'FARM_BUILDER',
  desc: ['Immediately renovate to clay at no cost. (You must pay the cost of this card though.)'],
  cost: { clay: 3, reed: 1 },
  passing: true,
  prerequisite: 'Wooden House',
})

export const E2_RenovationMaterials_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'renovation',
    sourceCard: CARD_ID,
    params: { freeCost: true },
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
