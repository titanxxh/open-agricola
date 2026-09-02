import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { getLogicalFields } from '../helpers/card-field'

const CARD_ID = 'E026_Sundial'
const TRIGGER_ROUNDS = new Set([7, 9])

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBeforeReturnHome: (state, player) => {
    if (!TRIGGER_ROUNDS.has(state.round)) return
    if (getLogicalFields(player).length === 0) return
    return {
      type: 'seq',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'sow', sourceCard: CARD_ID },
      ],
    }
  },
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
