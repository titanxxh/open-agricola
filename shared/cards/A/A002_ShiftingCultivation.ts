import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'A002_ShiftingCultivation'

const cardImpl = {
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

export const A002_ShiftingCultivation = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Shifting Cultivation',
    deck: 'A',
    number: 2,
    category: 'FARM_PLANNER',
    desc: ['Immediately plow 1 field.'],
    cost: { food: 2 },
    passing: true,
  },
  impl: cardImpl,
})

export const A002_ShiftingCultivation_impl = A002_ShiftingCultivation.impl
