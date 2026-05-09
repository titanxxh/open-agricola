import type { CardImpl } from '../registry'
import { C38_Christianity } from '../../cards-display/C/C38_Christianity'

const CARD_ID = C38_Christianity.id

export const C38_Christianity_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => {
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { recipientMode: 'others', food: 1 },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
