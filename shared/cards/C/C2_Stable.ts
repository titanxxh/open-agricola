import type { CardImpl } from '../registry'
import { C2_Stable } from '../../cards-display/C/C2_Stable'

const CARD_ID = C2_Stable.id

export const C2_Stable_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => {
    return {
      type: 'leaf' as const,
      actionId: 'stables',
      sourceCard: CARD_ID,
      actionContext: { max: 1, exactCost: { wood: 0, max: 1 }, cancelPolicy: 'forbidCancel' },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
