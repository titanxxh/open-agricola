import type { CardImpl } from '../registry'

const CARD_ID = 'C17_NewlyPlowedField'

export const C17_NewlyPlowedField_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => {
    return {
      type: 'leaf',
      actionId: 'plow',
      optional: true,
      sourceCard: CARD_ID,
      actionContext: { unrestricted: true, trueAction: false },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
