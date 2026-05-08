import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'
import { A13_RenovationCompany } from '../../cards-display/A/A13_RenovationCompany'

const CARD_ID = A13_RenovationCompany.id

registerPrerequisite(
  'In Wooden House with Exactly 2 Rooms',
  (player) => player.houseType === 'wood' && player.rooms === 2,
)

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
