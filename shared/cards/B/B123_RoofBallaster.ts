import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B123_RoofBallaster'

// BGA: optional: pay 1 food to get 1 stone per room.
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    const rooms = player.rooms
    if (rooms <= 0) return
    return {
      type: 'seq' as const,
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
        gainLeaf(CARD_ID, { stone: rooms }),
      ],
    }
  },
})

export const B123_RoofBallaster = new Occupation({
  id: CARD_ID,
  name: 'Roof Ballaster',
  deck: 'B',
  number: 123,
  category: 'RESOURCE_STONE',
  desc: ['When you play this card, you can immediately pay 1 <FOOD> to get 1 <STONE> for each room you have.'],
  cost: {},
  players: '1+',
})
