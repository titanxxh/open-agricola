import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'M030_FarmAnimalMarket'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      if ((player.resources.sheep ?? 0) < 2) return
      return {
        type: 'leaf' as const,
        optional: true,
        actionId: 'exchange',
        sourceCard: CARD_ID,
        actionContext: {
          directTrade: {
            from: { sheep: 2 },
            to: { cattle: 1, horse: 1 },
            sourceId: CARD_ID,
          },
        },
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
