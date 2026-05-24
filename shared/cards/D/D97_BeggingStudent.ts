import type { CardImpl } from '../registry'
import { D97_BeggingStudent } from '../../cards-display/D/D97_BeggingStudent'

const CARD_ID = D97_BeggingStudent.id

export const D97_BeggingStudent_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    player.resources.begging += 1
  },
  onStartHarvest: (_state, player) => {
    if (player.occupationHand.length === 0) return
    return {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'occupation',
          sourceCard: CARD_ID,
          params: { costOverride: {} },
        },
      ],
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
