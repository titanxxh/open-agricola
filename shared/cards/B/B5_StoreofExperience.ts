import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'B5_StoreofExperience'
const REWARDS: (keyof Resource)[] = ['stone', 'stone', 'stone', 'stone', 'stone', 'reed', 'clay', 'wood']

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const occsInHand = player.occupationHand.length
    const resource = REWARDS[Math.min(occsInHand, 7)]
    if (!resource) return
    return gainLeaf(CARD_ID, { [resource]: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B5_StoreofExperience = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Store of Experience",
    deck: "B",
    number: 5,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["If you have 0-4/5/6/7 occupations left in hand, you immediately get 1 <STONE>/<REED>/<CLAY>/<WOOD>."],
    passing: true,
  },
  impl: cardImpl,
})

export const B5_StoreofExperience_impl = B5_StoreofExperience.impl
