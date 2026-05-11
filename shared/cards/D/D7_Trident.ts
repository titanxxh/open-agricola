import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D7_Trident } from '../../cards-display/D/D7_Trident'

const CARD_ID = D7_Trident.id

const ROUND_FOOD: Record<number, number> = { 3: 3, 6: 4, 9: 5, 12: 6 }

export const D7_Trident_impl = {
  prerequisiteCheck: (_player, state) => {
    if (!state) return true
    return [3, 6, 9, 12].includes(state.round)
  },
  effect: {
  id: CARD_ID,
  onBuy: (state) => {
    const gain = ROUND_FOOD[state.round]
    if (gain) {
      return { type: 'seq', children: [gainLeaf(CARD_ID, { food: gain })] }
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
