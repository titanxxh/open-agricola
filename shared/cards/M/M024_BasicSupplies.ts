import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import type { Resource } from '../../contract/types'

const CARD_ID = 'M024_BasicSupplies'
const GOODS: readonly (keyof Resource)[] = ['fuel', 'food', 'wood', 'clay', 'reed', 'stone', 'grain']

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      const gain: Partial<Resource> = {}
      for (const resource of GOODS) {
        if ((player.resources[resource] ?? 0) < 1) gain[resource] = 1
      }
      if (Object.keys(gain).length === 0) return
      return gainLeaf(CARD_ID, gain)
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M024_BasicSupplies = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Basic Supplies",
    deck: "M",
    number: 24,
    category: "GOODS_PROVIDER",
    desc: [
        "You immediately get goods until you have at least 1 <FUEL>, 1 <FOOD>, 1 <WOOD>, 1 <CLAY>, 1 <REED>, 1 <STONE>, and 1 <GRAIN> in your supply."
    ],
    cost: {
        "wood": 1
    },
    passing: true,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M024_BasicSupplies_impl = M024_BasicSupplies.impl
