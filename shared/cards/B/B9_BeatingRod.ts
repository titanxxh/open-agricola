import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B9_BeatingRod } from '../../cards-display/B/B9_BeatingRod'
export { B9_BeatingRod }

const CARD_ID = B9_BeatingRod.id

export const B9_BeatingRod_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => ({
    type: 'xor' as const,
    children: [
      gainLeaf(CARD_ID, { reed: 1 }),
      {
        type: 'seq' as const,
        children: [
          payLeaf({ cardId: CARD_ID, cost: { reed: 1 } }),
          gainLeaf(CARD_ID, { cattle: 1 }),
        ],
      },
    ],
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
