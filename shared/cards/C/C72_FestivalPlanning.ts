import type { CardImpl } from '../registry'
import { C72_FestivalPlanning } from '../../cards-display/C/C72_FestivalPlanning'

const CARD_ID = C72_FestivalPlanning.id

export const C72_FestivalPlanning_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => {
    return {
      type: 'seq' as const,
      children: [
        {
          type: 'leaf' as const,
          actionId: 'reap',
          optional: true,
          sourceCard: CARD_ID,
        },
        {
          type: 'leaf' as const,
          actionId: 'improvement',
          optional: true,
          sourceCard: CARD_ID,
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
