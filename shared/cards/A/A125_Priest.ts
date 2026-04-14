import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'

const CARD_ID = 'A125_Priest'

// BGA: If you live in a clay house with exactly 2 rooms, get 3 CLAY, 2 REED, 2 STONE.
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    if (player.rooms !== 2 || player.houseType !== 'clay') return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { clay: 3, reed: 2, stone: 2 },
    }
  },
})

export const A125_Priest = new Occupation({
  id: CARD_ID,
  name: 'Priest',
  deck: 'A',
  number: 125,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['When you play this card, if you live in a clay house with exactly 2 rooms, you immediately get 3 <CLAY>, 2 <REED> and 2 <STONE>.'],
  cost: {},
  players: '1+',
})
