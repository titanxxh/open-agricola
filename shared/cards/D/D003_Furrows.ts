import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'D003_Furrows'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: () => ({
    type: 'leaf' as const,
    actionId: 'sow',
    sourceCard: CARD_ID,
    optional: true,
    actionContext: { maxSelections: 1 },
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D003_Furrows = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Furrows',
    deck: 'D',
    number: 3,
    category: 'ACTIONS_BOOSTER',
    desc: ['You can immediately sow in exactly 1 field.'],
    cost: {},
    passing: true,
  },
  impl: cardImpl,
})

export const D003_Furrows_impl = D003_Furrows.impl
