import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B008_MarketStall'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { vegetable: 1 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B008_MarketStall = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Market Stall",
    deck: "B",
    number: 8,
    category: "CROP_PROVIDER",
    desc: ["You immediately get 1 <VEGETABLE>. (Effectively, you are exchanging 1 <GRAIN> for 1 <VEGETABLE>)."],
    cost: { grain: 1 },
    passing: true,
  },
  impl: cardImpl,
})

export const B008_MarketStall_impl = B008_MarketStall.impl
