import type { CardImpl } from '../registry'
import { C4_WritingBoards } from '../../cards-display/C/C4_WritingBoards'

const CARD_ID = C4_WritingBoards.id

export const C4_WritingBoards_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const count = player.occupationPlayed.length
    if (count === 0) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { wood: count },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
