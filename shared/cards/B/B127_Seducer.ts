import { payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B127_Seducer } from '../../cards-display/B/B127_Seducer'
export { B127_Seducer }

const CARD_ID = B127_Seducer.id

export const B127_Seducer_impl = {
  effect: {
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
