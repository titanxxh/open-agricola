import { MinorImprovement } from '../types'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'

const CARD_ID = 'A13_RenovationCompany'

registerPrerequisite(
  'In Wooden House with Exactly 2 Rooms',
  (player) => player.houseType === 'wood' && player.rooms === 2,
)

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

export const A13_RenovationCompany_impl = {
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
      },
    ],
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
