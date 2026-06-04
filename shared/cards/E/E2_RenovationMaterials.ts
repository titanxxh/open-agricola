import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'E2_RenovationMaterials'

const cardImpl = {
  prerequisiteCheck: (player) => player.houseType === 'wood',
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'leaf' as const,
      actionId: 'renovate-house',
      sourceCard: CARD_ID,
      params: { selectedOption: 'clay' },
      actionContext: { exactCost: {} },
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E2_RenovationMaterials = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Renovation Materials',
    deck: 'E',
    number: 2,
    category: 'PASSING_-_ACTION_-_FARMYARD',
    desc: ['Immediately renovate to clay at no cost. (You must pay the cost of this card though.)'],
    cost: { clay: 3, reed: 1 },
    passing: true,
    prerequisite: 'Wooden House',
  },
  impl: cardImpl,
})

export const E2_RenovationMaterials_impl = E2_RenovationMaterials.impl
