import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A49_NestSite'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (state, _player) => {
    // Check if reed-bank currently has reed on it (i.e., no one took it last round)
    const reedBank = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (!reedBank || (reedBank.resources?.reed ?? 0) <= 0) return
    return gainLeaf(CARD_ID, { food: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A49_NestSite = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Nest Site',
    deck: 'A',
    number: 49,
    category: 'FOOD_PROVIDER',
    desc: ['Each time 1 <REED> is placed on a non-empty __Reed Bank__ accumulation space during the preparation phase, you get 1 <FOOD>.'],
    cost: { food: 1 },
    prerequisite: '1 Occupation',
    occupationPrerequisites: { min: 1 },
  },
  impl: cardImpl,
})

export const A49_NestSite_impl = A49_NestSite.impl
