import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B141_FieldCaretaker'

// BGA: optional xor: get 1 grain free, or pay 1 clay for 2 grain, or pay 3 clay for 3 grain.
// Card is a field.
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, _player) => ({
    type: 'xor' as const,
    optional: true,
    children: [
      gainLeaf(CARD_ID, { grain: 1 }),
      {
        type: 'seq' as const,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { clay: 1 } }),
          gainLeaf(CARD_ID, { grain: 2 }),
        ],
      },
      {
        type: 'seq' as const,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { clay: 3 } }),
          gainLeaf(CARD_ID, { grain: 3 }),
        ],
      },
    ],
  }),
})

export const B141_FieldCaretaker = new Occupation({
  id: CARD_ID,
  name: 'Field Caretaker',
  deck: 'B',
  number: 141,
  category: 'CROP_PROVIDER',
  desc: ['When you play this card, you can immediately exchange 0/1/3 <CLAY> for 1/2/3 <GRAIN>. This card is a field.'],
  cost: {},
  players: '3+',
})
