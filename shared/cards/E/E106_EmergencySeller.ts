import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'E106_EmergencySeller'

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, player) => {
    const farmers = player.familySize

    const exchangeChoice: ActionFlow = {
      type: 'xor' as const,
      optional: true,
      children: [
        {
          type: 'seq' as const,
          children: [
            { type: 'leaf' as const, actionId: 'pay-resources', sourceCard: CARD_ID, params: { wood: 1 } },
            { type: 'leaf' as const, actionId: 'gain', sourceCard: CARD_ID, params: { food: 2 } },
          ],
        },
        {
          type: 'seq' as const,
          children: [
            { type: 'leaf' as const, actionId: 'pay-resources', sourceCard: CARD_ID, params: { clay: 1 } },
            { type: 'leaf' as const, actionId: 'gain', sourceCard: CARD_ID, params: { food: 2 } },
          ],
        },
        {
          type: 'seq' as const,
          children: [
            { type: 'leaf' as const, actionId: 'pay-resources', sourceCard: CARD_ID, params: { reed: 1 } },
            { type: 'leaf' as const, actionId: 'gain', sourceCard: CARD_ID, params: { food: 3 } },
          ],
        },
        {
          type: 'seq' as const,
          children: [
            { type: 'leaf' as const, actionId: 'pay-resources', sourceCard: CARD_ID, params: { stone: 1 } },
            { type: 'leaf' as const, actionId: 'gain', sourceCard: CARD_ID, params: { food: 3 } },
          ],
        },
      ],
    }

    const children: ActionFlow[] = Array.from({ length: farmers }, () => exchangeChoice)

    return {
      type: 'seq' as const,
      optional: true,
      children,
    }
  },
})

export const E106_EmergencySeller = new Occupation({
  id: CARD_ID,
  name: 'Emergency Seller',
  deck: 'E',
  number: 106,
  category: 'FOOD_MISC',
  desc: [
    'When you play this card, you can immediately turn as many building resources into food as you have people:',
    '<WOOD>/<CLAY> → 2 <FOOD>',
    '<REED>/<STONE> → 3 <FOOD>',
  ],
  players: '1+',
})
