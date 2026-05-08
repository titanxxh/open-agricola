import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A49_NestSite } from '../../cards-display/A/A49_NestSite'
export { A49_NestSite }

const CARD_ID = A49_NestSite.id

export const A49_NestSite_impl = {
  effect: {
  id: CARD_ID,
  onBeforeStartOfTurn: (state, _player) => {
    // Check if reed-bank currently has reed on it (i.e., no one took it last round)
    const reedBank = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (!reedBank || (reedBank.resources?.reed ?? 0) <= 0) return
    return gainLeaf(CARD_ID, { food: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
