import type { CardImpl } from '../registry'
import { E97_Beneficiary } from '../../cards-display/E/E97_Beneficiary'

const CARD_ID = E97_Beneficiary.id
const STALLWRIGHT_ID = 'E89_Stallwright'

export const E97_Beneficiary_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      // Only triggers when this is the 3rd occupation played (including this card)
      if (player.occupationPlayed.length !== 3) return

      return {
        type: 'or' as const,
        optional: true,
        children: [
          {
            type: 'seq' as const,
            children: [
              ...(player.occupationPlayed.includes(STALLWRIGHT_ID)
                ? [{
                    type: 'leaf' as const,
                    actionId: 'stables',
                    sourceCard: CARD_ID,
                    optional: true,
                    actionContext: { max: 1, exactCost: { max: 1 }, trueAction: false },
                  }]
                : []),
              {
                type: 'leaf' as const,
                actionId: 'occupation',
                sourceCard: CARD_ID,
                params: { exactCost: { food: 1 } },
              },
            ],
          },
          {
            type: 'leaf' as const,
            actionId: 'improvement',
            sourceCard: CARD_ID,
            actionContext: { types: ['minor'], trueAction: false },
          },
        ],
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
