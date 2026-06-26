import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { craftResourceGain } from './moor-batch1-helpers'

const CARD_ID = 'M028_OutOnTheWallaby'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      const gain = craftResourceGain(player)
      if (Object.keys(gain).length === 0) return
      return gainLeaf(CARD_ID, gain)
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M028_OutOnTheWallaby = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Out on the Wallaby",
    deck: "M",
    number: 28,
    category: "ACTIONS_BOOSTER",
    desc: [
        "You immediately get goods for each craft building that you have: 3 <WOOD> for the Joinery, 3 <CLAY> for the Pottery, 2 <REED> for the Basketmaker's Workshop."
    ],
    cost: {},
    passing: true,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M028_OutOnTheWallaby_impl = M028_OutOnTheWallaby.impl
