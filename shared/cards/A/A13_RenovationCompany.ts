import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'A13_RenovationCompany'

const cardImpl = {
  effect: {
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
          actionContext: { exactCost: {} },
        },
      ],
    }),
  },
  prerequisiteCheck: (player) => player.houseType === 'wood' && player.rooms === 2,
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A13_RenovationCompany = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Renovation Company',
    deck: 'A',
    number: 13,
    category: 'FARM_PLANNER',
    desc: ['When you play this card, you immediately get 3 <CLAY>. Immediately after, you can renovate without paying any building resources.'],
    cost: { wood: 4 },
    prerequisite: 'In Wooden House with Exactly 2 Rooms',
  },
  impl: cardImpl,
})

export const A13_RenovationCompany_impl = A13_RenovationCompany.impl
