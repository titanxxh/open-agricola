import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { craftBuildingCount } from './moor-batch1-helpers'

const CARD_ID = 'M067_ChamberOfCommerce'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { wood: 1, reed: 1 }),
    computeBonusScore: (_state, player) => craftBuildingCount(player),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M067_ChamberOfCommerce = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Chamber of Commerce",
    deck: "M",
    number: 67,
    category: "POINTS_PROVIDER",
    desc: [
        "When you play this card, you immediately get 1 <WOOD> and 1 <REED>. During scoring, you get 1 additional bonus <SCORE> for each of the \"Joinery\", \"Pottery\", and \"Basketmaker's Workshop\" major improvements that you have."
    ],
    cost: {
        "clay": 2,
        "stone": 1
    },
    vp: 1,
    extraVp: true,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M067_ChamberOfCommerce_impl = M067_ChamberOfCommerce.impl
