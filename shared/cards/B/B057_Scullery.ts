import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B057_Scullery'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    if (player.houseType !== 'wood') return
    return gainLeaf(CARD_ID, { food: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B057_Scullery = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Scullery',
    deck: 'B',
    number: 57,
    category: 'FOOD_PROVIDER',
    desc: ['At the start of each round, if you live in a wooden house, you get 1 <FOOD>.'],
    cost: { wood: 1, clay: 1 },
  },
  impl: cardImpl,
})

export const B057_Scullery_impl = B057_Scullery.impl
