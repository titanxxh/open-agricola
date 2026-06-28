import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'D011_LawnFertilizer'

const cardImpl = {
  effect: {
    id: CARD_ID,
    computePastureCapacityModifiers: () => [{
      sourceCard: CARD_ID,
      kind: 'replacement',
      appliesTo: ({ pasture }) => pasture.size === 1,
      apply: (_capacity, { pasture }) => 3 * (pasture.stables + 1),
    }],
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D011_LawnFertilizer = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Lawn Fertilizer',
    deck: 'D',
    number: 11,
    category: 'FARM_PLANNER',
    desc: ['Your pastures of size 1 can hold up to 3 animals of the same type. (With a stable, they can hold up to 6 animals of the same type.)'],
    cost: {},
  },
  impl: cardImpl,
})

export const D011_LawnFertilizer_impl = D011_LawnFertilizer.impl
