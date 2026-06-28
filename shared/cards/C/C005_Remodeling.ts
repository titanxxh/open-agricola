import { defineMinorCard } from '../card-source'
import { collectCardsAs } from '../helpers/card-type'
import type { CardImpl } from '../registry'

const CARD_ID = 'C005_Remodeling'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const clayRooms = player.houseType === 'clay' ? player.rooms : 0
    const majorCount = collectCardsAs(player, 'major').length
    const total = clayRooms + majorCount
    if (total === 0) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { clay: total },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C005_Remodeling = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Remodeling",
    deck: "C",
    number: 5,
    category: "BUILDING_RESOURCE_PROVIDER",
    desc: ["You immediately get 1 <CLAY> for each clay room and for each major improvement you have."],
    cost: { food: 1 },
    passing: true,
  },
  impl: cardImpl,
})

export const C005_Remodeling_impl = C005_Remodeling.impl
