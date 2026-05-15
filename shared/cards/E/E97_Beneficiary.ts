import type { CardImpl } from '../registry'
import { E97_Beneficiary } from '../../cards-display/E/E97_Beneficiary'

const CARD_ID = E97_Beneficiary.id

export const E97_Beneficiary_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      // Only triggers when this is the 3rd occupation played (including this card)
      if (player.occupationPlayed.length !== 3) return

      return {
        type: 'xor' as const,
        optional: true,
        children: [
          {
            type: 'seq' as const,
            children: [
              {
                type: 'leaf' as const,
                actionId: 'play-occupation',
                sourceCard: CARD_ID,
                params: { cost: { food: 1 } },
              },
            ],
          },
          {
            type: 'leaf' as const,
            actionId: 'minor-improvement',
            sourceCard: CARD_ID,
            params: { trueAction: false },
            actionContext: { trueAction: false },
          },
        ],
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
