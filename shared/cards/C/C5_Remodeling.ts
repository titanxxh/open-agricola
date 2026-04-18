import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { collectCardsAs } from '../helpers/card-type'

const CARD_ID = 'C5_Remodeling'

registerCardEffect({
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
})

export const C5_Remodeling = new MinorImprovement({
  id: CARD_ID,
  name: "Remodeling",
  deck: "C",
  number: 5,
  category: "BUILDING_RESOURCE_PROVIDER",
  desc: ["You immediately get 1 <CLAY> for each clay room and for each major improvement you have."],
  cost: { food: 1 },
  passing: true,
  newSet: true,
})
