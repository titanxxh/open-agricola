import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B167_StableSergeant'

// BGA: complex check if farm can accommodate sheep+pig+cattle. If so, optional pay 2 food for all 3.
// Simplified: optional pay 2 food to get 1 sheep, 1 pig, 1 cattle.
// TODO: verify farm can accommodate all 3 animals before offering.
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, _player) => ({
    type: 'seq' as const,
    optional: true,
    children: [
      payLeaf({ cardId: CARD_ID, cost: { food: 2 } }),
      gainLeaf(CARD_ID, { sheep: 1, boar: 1, cattle: 1 }),
    ],
  }),
})

export const B167_StableSergeant = new Occupation({
  id: CARD_ID,
  name: 'Stable Sergeant',
  deck: 'B',
  number: 167,
  category: 'ANIMAL_HANDLER',
  desc: ['When you play this card, you can pay 2 <FOOD> to get 1 <SHEEP>, 1 <PIG>, and 1 <CATTLE>, but only if you can accommodate all three animals on your farm.'],
  cost: {},
  players: '4+',
})
