import type { CardImpl } from '../registry'
import { A2_ShiftingCultivation } from '../../cards-display/A/A2_ShiftingCultivation'

const CARD_ID = A2_ShiftingCultivation.id

export const A2_ShiftingCultivation_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'plow',
    sourceCard: CARD_ID,
    optional: true,
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
