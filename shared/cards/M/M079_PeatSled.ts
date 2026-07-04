import { defineMinorCard } from '../card-source'
import { futureMeeplesNode } from '../../actions/effects/internal/future-meeples'
import type { CardImpl } from '../registry'

const CARD_ID = 'M079_PeatSled'

const CHOICES = [
  { offset: 2, fuel: 3 },
  { offset: 4, fuel: 4 },
  { offset: 7, fuel: 5 },
  { offset: 10, fuel: 6 },
]

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      const children = CHOICES
        .map(({ offset, fuel }) => ({
          round: state.round + offset,
          fuel,
        }))
        .filter(({ round }) => round <= 14)
        .map(({ round, fuel }) => futureMeeplesNode({
          cardId: CARD_ID,
          playerId: player.id,
          entries: [{ round, resources: { fuel } }],
        }))
      if (children.length === 0) return
      return { type: 'xor', children }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M079_PeatSled = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Peat Sled",
    deck: "M",
    number: 79,
    category: "GOODS_PROVIDER",
    desc: [
        "Add your choice of 2/4/7/10 to the current round and place 3/4/5/6 <FUEL> on the corresponding round space. At the start of that round, you get the <FUEL>."
    ],
    cost: {
        "wood": 1
    },
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M079_PeatSled_impl = M079_PeatSled.impl
