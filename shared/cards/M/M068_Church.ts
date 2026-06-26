import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'M068_Church'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { food: 2 }),
    onStartReturnHome: (_state, player) => {
      if ((player.resources.fuel ?? 0) < 1) return
      return {
        type: 'seq' as const,
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { fuel: 1 } }),
          { type: 'leaf' as const, actionId: 'bonus-vp' as const, sourceCard: CARD_ID },
        ],
      }
    },
  },
  reaches: ['Major_Moor_VillageChurch'] as readonly string[],
} satisfies CardImpl

export const M068_Church = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Church",
    deck: "M",
    number: 68,
    category: "POINTS_PROVIDER",
    desc: [
        "Returning home phase: once, you can pay 1 <FUEL> to get 1 bonus point. When you build this upgrade, you immediately get 2 food. The Village Church starts under the Well."
    ],
    cost: {},
    vp: 5,
    extraVp: true,
    returnCards: [
        "Major_Moor_VillageChurch"
    ],
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M068_Church_impl = M068_Church.impl
