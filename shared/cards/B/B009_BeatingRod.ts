import { defineMinorCard } from '../card-source'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B009_BeatingRod'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => ({
    type: 'xor' as const,
    children: [
      gainLeaf(CARD_ID, { reed: 1 }),
      {
        type: 'seq' as const,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { reed: 1 } }),
          gainLeaf(CARD_ID, { cattle: 1 }),
        ],
      },
    ],
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B009_BeatingRod = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Beating Rod",
    deck: "B",
    number: 9,
    category: "GOODS_PROVIDER",
    desc: ["You can immediately choose to either get 1 <REED> or exchange 1 <REED> for 1 <CATTLE>."],
    passing: true,
  },
  impl: cardImpl,
})

export const B009_BeatingRod_impl = B009_BeatingRod.impl
