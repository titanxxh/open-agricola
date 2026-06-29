import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { bestBakeFood } from './moor-batch1-helpers'

const CARD_ID = 'M026_ChimneyHood'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      const food = bestBakeFood(player)
      if (food === 0) return
      return gainLeaf(CARD_ID, { food })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M026_ChimneyHood = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Chimney Hood",
    deck: "M",
    number: 26,
    category: "FOOD_PROVIDER",
    desc: [
        "You immediately get as much <FOOD> as you would get from one of your baking improvements if you baked 1 <GRAIN>."
    ],
    cost: {
        "clay": 1
    },
    passing: true,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M026_ChimneyHood_impl = M026_ChimneyHood.impl
