import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'A012_DrinkingTrough'

const cardImpl = {
  effect: {
    id: CARD_ID,
    computePastureCapacityModifiers: () => [{
      sourceCard: CARD_ID,
      kind: 'additive',
      apply: (capacity) => capacity + 2,
    }],
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A012_DrinkingTrough = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Drinking Trough",
    deck: "A",
    number: 12,
    category: "FARM_PLANNER",
    desc: ["Each of your pastures (with or without a stable) can hold up to 2 more animals."],
    cost: { clay: 1 },
  },
  impl: cardImpl,
})

export const A012_DrinkingTrough_impl = A012_DrinkingTrough.impl
