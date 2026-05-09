import type { ActionFlow } from '../../contract/types'
import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'
import { E106_EmergencySeller } from '../../cards-display/E/E106_EmergencySeller'

const CARD_ID = E106_EmergencySeller.id

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
