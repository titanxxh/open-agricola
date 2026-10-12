import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'E026_Sundial'

const cardImpl = {
  effect: {
    id: CARD_ID,
  timedRules: [{ key: 'extra-sowing', at: { kind: 'rounds', rounds: [7, 9], phase: 'onBeforeReturnHome' }, body: { kind: 'condition', condition: { kind: 'has-fields' }, body: { kind: 'optional', body: { kind: 'action', actionId: 'sow' } } } }],
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E026_Sundial = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Sundial',
    deck: 'E',
    number: 26,
    category: 'ACTION',
    desc: ['At the end of the work phases of rounds 7 and 9, you can take a __Sow__ action without placing a person.'],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const E026_Sundial_impl = E026_Sundial.impl
