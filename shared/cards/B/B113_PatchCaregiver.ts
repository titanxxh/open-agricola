import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B113_PatchCaregiver'

// BGA: optional xor: buy 1 grain for 1 food, or 1 vegetable for 3 food. Card is a field.
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, _player) => ({
    type: 'xor' as const,
    optional: true,
    children: [
      {
        type: 'seq' as const,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          gainLeaf(CARD_ID, { grain: 1 }),
        ],
      },
      {
        type: 'seq' as const,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 3 } }),
          gainLeaf(CARD_ID, { vegetable: 1 }),
        ],
      },
    ],
  }),
})

export const B113_PatchCaregiver = new Occupation({
  id: CARD_ID,
  name: 'Patch Caregiver',
  deck: 'B',
  number: 113,
  category: 'CROP_PROVIDER',
  desc: ['When you play this card, you can choose to buy 1 <GRAIN> for 1 <FOOD>, or 1 <VEGETABLE> for 3 <FOOD>. This card is a field.'],
  cost: {},
  players: '1+',
})
