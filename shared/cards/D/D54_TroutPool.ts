import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D54_TroutPool'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (state, _player) => {
    const fishingSpace = state.actionSpaces.find((s) => s.id === 'fishing')
    const fishFood = fishingSpace?.resources?.food ?? 0
    if (fishFood < 3) return
    return gainLeaf(CARD_ID, { food: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D54_TroutPool = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Trout Pool',
    deck: 'D',
    number: 54,
    category: 'FOOD_PROVIDER',
    desc: ['At the start of each work phase, if there are at least 3 <FOOD> on the __Fishing__ accumulation space, you get 1 <FOOD> from the general supply.'],
    cost: { clay: 2 },
    vp: 1,
  },
  impl: cardImpl,
})

export const D54_TroutPool_impl = D54_TroutPool.impl
