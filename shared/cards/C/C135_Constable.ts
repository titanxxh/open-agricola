import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C135_Constable } from '../../cards-display/C/C135_Constable'
export { C135_Constable }

const CARD_ID = C135_Constable.id

const WOOD_BY_REMAINING: Record<number, number> = {
  0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 2, 6: 3, 7: 3, 8: 3,
  9: 4, 10: 4, 11: 4, 12: 4, 13: 4, 14: 4,
}

export const C135_Constable_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state) => {
    const round = state.round
    if (round >= 14) return
    const remaining = 14 - round
    const wood = WOOD_BY_REMAINING[remaining] ?? 0
    if (wood <= 0) return
    return gainLeaf(CARD_ID, { wood })
  },
  computeBonusScore: (_state, _player, ctx) => {
    // 3 VP if this player has no negative scoring categories
    return (ctx.categories ?? []).some((cat) => cat.total < 0) ? 0 : 3
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
