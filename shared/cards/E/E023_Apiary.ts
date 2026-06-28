import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'E023_Apiary'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBeforeReturnHome: (_state, player) => {
    if (player.fields.length === 0) return
    return {
      type: 'seq',
      optional: true,
      children: [
        { type: 'leaf', actionId: 'sow', params: { max: 1 }, sourceCard: CARD_ID },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E023_Apiary = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Apiary',
    deck: 'E',
    number: 23,
    category: 'ACTION',
    desc: ['At the end of each work phase, you can sow exactly 1 crop on 1 field.'],
    cost: {},
    prerequisite: '4 Occupations',
    occupationPrerequisites: { min: 4 },
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const E023_Apiary_impl = E023_Apiary.impl
