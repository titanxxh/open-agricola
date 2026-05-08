import { Occupation } from '../types'
import type { ActionFlow } from '../../contract/types'
import { familySize } from '../../game/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'E106_EmergencySeller'

export const E106_EmergencySeller = new Occupation({
  id: CARD_ID,
  name: 'Emergency Seller',
  deck: 'E',
  number: 106,
  category: 'FOOD',
  desc: [
    'When you play this card, you can immediately turn as many building resources into food as you have people:',
    '<WOOD>/<CLAY> <ARROW> 2 <FOOD>',
    '<REED>/<STONE> <ARROW> 3 <FOOD>',
  ],
  players: '1+',
})

export const E106_EmergencySeller_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const farmers = familySize(player)

    const exchangeChoice: ActionFlow = {
      type: 'xor' as const,
      optional: true,
      children: [
        {
          type: 'seq' as const,
          children: [
            { type: 'leaf' as const, actionId: 'pay', sourceCard: CARD_ID, params: { wood: 1 } },
            { type: 'leaf' as const, actionId: 'gain', sourceCard: CARD_ID, params: { food: 2 } },
          ],
        },
        {
          type: 'seq' as const,
          children: [
            { type: 'leaf' as const, actionId: 'pay', sourceCard: CARD_ID, params: { clay: 1 } },
            { type: 'leaf' as const, actionId: 'gain', sourceCard: CARD_ID, params: { food: 2 } },
          ],
        },
        {
          type: 'seq' as const,
          children: [
            { type: 'leaf' as const, actionId: 'pay', sourceCard: CARD_ID, params: { reed: 1 } },
            { type: 'leaf' as const, actionId: 'gain', sourceCard: CARD_ID, params: { food: 3 } },
          ],
        },
        {
          type: 'seq' as const,
          children: [
            { type: 'leaf' as const, actionId: 'pay', sourceCard: CARD_ID, params: { stone: 1 } },
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
},
  reaches: [] as readonly string[],
} satisfies CardImpl
