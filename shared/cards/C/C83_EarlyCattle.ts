import type { CardImpl } from '../registry'
import { C83_EarlyCattle } from '../../cards-display/C/C83_EarlyCattle'
export { C83_EarlyCattle }

const CARD_ID = C83_EarlyCattle.id

export const C83_EarlyCattle_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => {
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { cattle: 2 },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
