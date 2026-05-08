import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C127_Lover } from '../../cards-display/C/C127_Lover'
export { C127_Lover }

const CARD_ID = C127_Lover.id

export const C127_Lover_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, _player) => {
    const roundsLeft = 14 - state.round
    if (roundsLeft <= 0) return
    return {
      type: 'seq' as const,
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: roundsLeft } }),
        {
          type: 'leaf' as const,
          actionId: 'family-growth',
          sourceCard: CARD_ID,
          actionContext: { skipRoomCheck: true },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
