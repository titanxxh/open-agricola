import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'M080_AdvancePayment'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, {
      fuel: 1,
      food: 1,
      wood: 1,
      clay: 1,
      reed: 1,
      stone: 1,
      sheep: 1,
      grain: 1,
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M080_AdvancePayment = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Advance Payment",
    deck: "M",
    number: 80,
    category: "GOODS_PROVIDER",
    desc: [
        "You immediately get 1 <FUEL>, 1 <FOOD>, 1 <WOOD>, 1 <CLAY>, 1 <REED>, 1 <STONE>, 1 <SHEEP>, and 1 <GRAIN>."
    ],
    cost: {},
    vp: -4,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M080_AdvancePayment_impl = M080_AdvancePayment.impl
