import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'M043_WildFields'

const plowLeaf = {
  type: 'leaf' as const,
  actionId: 'plow',
  optional: true,
  sourceCard: CARD_ID,
  actionContext: { adjacencyPolicy: 'notAdjacentToFields' },
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'seq' as const,
      children: [plowLeaf, plowLeaf],
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M043_WildFields = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Wild Fields",
    deck: "M",
    number: 43,
    category: "FARM_PLANNER",
    desc: [
        "You can immediately place up to 2 <FIELD> tiles, one at a time, on unused farmyard spaces that are not adjacent to existing <FIELD>. You can connect your <FIELD> later. All future <FIELD> must be adjacent to at least one existing <FIELD>."
    ],
    cost: {
        "vegetable": 2
    },
    prerequisite: "2 Fields",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M043_WildFields_impl = M043_WildFields.impl
