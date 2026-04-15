import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { payLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B127_Seducer'

// BGA: if round >= 5, optional: pay 1 stone + 1 grain + 1 vegetable + 1 sheep to take family growth without room.
registerCardEffect({
  id: CARD_ID,
  onBuy: (state, _player) => {
    if (state.round < 5) return
    return {
      type: 'seq' as const,
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { stone: 1, grain: 1, vegetable: 1, sheep: 1 } }),
        {
          type: 'leaf' as const,
          actionId: 'grow-family-without-room',
          sourceCard: CARD_ID,
        },
      ],
    }
  },
})

export const B127_Seducer = new Occupation({
  id: CARD_ID,
  name: 'Seducer',
  deck: 'B',
  number: 127,
  category: 'FARM_PLANNER',
  desc: ['When you play this card in round 5 or later, you can immediately pay 1 <STONE>, 1 <GRAIN>, 1 <VEGETABLE>, and 1 <SHEEP> to take a __Family Growth Even without Room__ action.'],
  cost: {},
  players: '3+',
})
