import type { CardImpl } from '../registry'
import { C139_BasketmakersWife } from '../../cards-display/C/C139_BasketmakersWife'

const CARD_ID = C139_BasketmakersWife.id

export const C139_BasketmakersWife_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => {
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { reed: 1, food: 1 },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
