import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'A117_WoodCarrier'

// BGA: When you play this card, you immediately get 1 WOOD for each improvement in front of you.
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    // countAllImprovements in BGA = major + minor improvements
    const n = player.improvements.length + player.minorPlayed.length
    if (n <= 0) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { wood: n },
    }
  },
})

export const A117_WoodCarrier = new Occupation({
  id: CARD_ID,
  name: 'Wood Carrier',
  deck: 'A',
  number: 117,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['When you play this card, you immediately get 1 <WOOD> for each improvement in front of you.'],
  cost: {},
  players: '1+',
  newSet: true,
})
