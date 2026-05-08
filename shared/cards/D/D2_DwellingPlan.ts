import type { CardImpl } from '../registry'
import { D2_DwellingPlan } from '../../cards-display/D/D2_DwellingPlan'
export { D2_DwellingPlan }

const CARD_ID = D2_DwellingPlan.id

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
