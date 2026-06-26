import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import type { Resource } from '../../contract/types'
import { hasFarmShape, unusedFarmyardSpaces } from './moor-batch1-helpers'

const CARD_ID = 'M025_HouseholdInventory'
const REWARDS: readonly (keyof Resource)[] = ['reed', 'grain', 'cattle', 'stone', 'vegetable', 'horse']

const cardImpl = {
  prerequisiteCheck: hasFarmShape,
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      const count = unusedFarmyardSpaces(player) - 4
      if (count < 1 || count > REWARDS.length) return
      const gain: Partial<Resource> = {}
      for (const resource of REWARDS.slice(0, count)) {
        gain[resource] = (gain[resource] ?? 0) + 1
      }
      return gainLeaf(CARD_ID, gain)
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M025_HouseholdInventory = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Household Inventory",
    deck: "M",
    number: 25,
    category: "GOODS_PROVIDER",
    desc: [
        "If you have exactly 5/6/7/8/9/10 unused farmyard spaces, you immediately get the following 1/2/3/4/5/6 goods (in this order): 1 <REED>, 1 <GRAIN>, 1 <CATTLE>, 1 <STONE>, 1 <VEGETABLE>, 1 <HORSE>."
    ],
    cost: {
        "food": 1
    },
    prerequisite: "1 Field, 1 Pasture or 1 Stable",
    passing: true,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M025_HouseholdInventory_impl = M025_HouseholdInventory.impl
