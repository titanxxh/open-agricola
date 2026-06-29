import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'A006_StorageBarn'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const gains: Record<string, number> = {}
    if (player.improvements.includes('Major_Well')) gains.stone = 1
    if (player.improvements.includes('Major_Joinery')) gains.wood = 1
    if (player.improvements.includes('Major_Pottery')) gains.clay = 1
    if (player.improvements.includes('Major_Basket')) gains.reed = 1
    if (Object.keys(gains).length === 0) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: gains,
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A006_StorageBarn = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Storage Barn',
    deck: 'A',
    number: 6,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ["If you have the Well, Joinery, Pottery, and/or Basketmaker's Workshop, you immediately get 1 <STONE>, 1 <WOOD>, 1 <CLAY>, and/or 1 <REED>, respectively."],
    cost: {},
    passing: true,
  },
  impl: cardImpl,
})

export const A006_StorageBarn_impl = A006_StorageBarn.impl
