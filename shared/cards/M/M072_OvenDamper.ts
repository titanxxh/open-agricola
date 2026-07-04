import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getPlayedCardDefinitions } from '../helpers/card-type'
import type { CardImpl } from '../registry'

const CARD_ID = 'M072_OvenDamper'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { fuel: 3 }),
    computeBonusScore: (_state, player) =>
      getPlayedCardDefinitions(player).filter((def) => def.ovenIdentity === true).length,
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M072_OvenDamper = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Oven Damper",
    deck: "M",
    number: 72,
    category: "POINTS_PROVIDER",
    desc: [
        "When you play this card, you immediately get 3 <FUEL>. During scoring, you get 1 additional bonus <SCORE> each for the \"Clay Oven\", \"Stone Oven\", \"Heating Oven\", and \"Tiled Oven\" major improvements and the \"Oven Installation\" upgrade."
    ],
    cost: {
        "stone": 2
    },
    vp: 1,
    extraVp: true,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M072_OvenDamper_impl = M072_OvenDamper.impl
