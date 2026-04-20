import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'A2_ShiftingCultivation'

export const A2_ShiftingCultivation = new MinorImprovement({
  id: CARD_ID,
  name: 'Shifting Cultivation',
  deck: 'A',
  number: 2,
  category: 'FARM_PLANNER',
  desc: ['Immediately plow 1 field.'],
  cost: { food: 2 },
  passing: true,
})

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
