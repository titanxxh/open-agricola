import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B37_Grange'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { food: 1 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B37_Grange = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Grange',
    deck: 'B',
    number: 37,
    category: 'POINTS_PROVIDER',
    desc: ['When you play this card, you immediately get 1 <FOOD>.'],
    cost: {},
    vp: 3,
    prerequisite: '6 Field Tiles and All Animal Types',
  },
  impl: cardImpl,
})

export const B37_Grange_impl = B37_Grange.impl
