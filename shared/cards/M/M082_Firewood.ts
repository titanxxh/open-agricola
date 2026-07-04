import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'M082_Firewood'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { fuel: 1 }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M082_Firewood = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Firewood",
    deck: "M",
    number: 82,
    category: "GOODS_PROVIDER",
    desc: [
        "When you play this card, you immediately get 1 <FUEL>. During each harvest, if you exchange at least 1 <WOOD> for 1 <FUEL> to heat your house, you need a total of 1 <FUEL> less to heat it."
    ],
    cost: {
        "wood": 1
    },
    prerequisite: "1 Major Improvement",
    implemented: true,
    requiresFarmersOfTheMoor: true,
    heatingWoodToFuelDiscount: 1,
  },
  impl: cardImpl,
})

export const M082_Firewood_impl = M082_Firewood.impl
