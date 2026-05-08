import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B116_Shoreforester } from '../../cards-display/B/B116_Shoreforester'

const CARD_ID = B116_Shoreforester.id

export const B116_Shoreforester_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { wood: 1 }),
  onRoundStart: (state, _player) => {
    const space = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (!space) return
    if ((space.resources.reed ?? 0) !== 0) return
    return gainLeaf(CARD_ID, { wood: 1 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
