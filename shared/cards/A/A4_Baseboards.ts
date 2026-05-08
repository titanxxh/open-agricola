import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'
import { A4_Baseboards } from '../../cards-display/A/A4_Baseboards'
export { A4_Baseboards }

const CARD_ID = A4_Baseboards.id

export const A4_Baseboards_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    const rooms = player.rooms
    const farmers = familySize(player)
    const amount = rooms + (rooms > farmers ? 1 : 0)
    if (amount <= 0) return
    return {
      type: 'leaf' as const,
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { wood: amount },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
