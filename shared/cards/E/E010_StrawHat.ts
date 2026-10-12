import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'E010_StrawHat'

const cardImpl = {
  effect: {
    id: CARD_ID,
  timedRules: [{ key: 'farmland-workers', at: { kind: 'rounds', rounds: [3, 6], phase: 'onBeforeReturnHome' }, body: { kind: 'operation', operation: { kind: 'each-space-worker', spaceId: 'farmland', alternativeGain: { food: 1 } } } }],
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E010_StrawHat = defineMinorCard({
  meta: {
    id: "E010_StrawHat",
    name: "Straw Hat",
    deck: "E",
    number: 10,
    desc: ["At the end of the work phases of rounds 3 and 6, you can move your person from the __Farmland__ action space to an unoccupied action space and take that action, or get 1 <FOOD>."],
    cost: {"reed":1},
    category: 'ACTION_-_GUEST',
  },
  impl: cardImpl,
})

export const E010_StrawHat_impl = E010_StrawHat.impl
