import { defineMinorCard } from '../card-source'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'M030_FarmAnimalMarket'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      if ((player.resources.sheep ?? 0) < 2) return
      return {
        type: 'seq' as const,
        optional: true,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { sheep: 2 } }),
          gainLeaf(CARD_ID, { cattle: 1, horse: 1 }),
        ],
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M030_FarmAnimalMarket = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Farm Animal Market",
    deck: "M",
    number: 30,
    category: "LIVESTOCK_PROVIDER",
    desc: [
        "You can immediately exchange exactly 2 <SHEEP> for 1 <CATTLE> and 1 <HORSE>. You may not exchange only 1 sheep."
    ],
    cost: {
        "food": 1
    },
    passing: true,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M030_FarmAnimalMarket_impl = M030_FarmAnimalMarket.impl
