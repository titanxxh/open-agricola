import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { familySize } from '../../game/player'

const CARD_ID = 'A4_Baseboards'

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    const rooms = player.rooms
    const farmers = familySize(player)
    const amount = rooms + (rooms > farmers ? 1 : 0)
    if (amount <= 0) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { wood: amount },
    }
  },
})

export const A4_Baseboards = new MinorImprovement({
  id: CARD_ID,
  name: 'Baseboards',
  deck: 'A',
  number: 4,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['You immediately get 1 <WOOD> for each room you have. If you have more rooms than people, you get 1 additional <WOOD>.'],
  cost: { food: 2, grain: 1 },
  passing: true,
})
