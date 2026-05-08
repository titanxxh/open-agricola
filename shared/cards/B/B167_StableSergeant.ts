import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B167_StableSergeant } from '../../cards-display/B/B167_StableSergeant'
export { B167_StableSergeant }

const CARD_ID = B167_StableSergeant.id

export const B167_StableSergeant_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => ({
    type: 'seq' as const,
    optional: true,
    children: [
      payLeaf({ cardId: CARD_ID, cost: { food: 2 } }),
      gainLeaf(CARD_ID, { sheep: 1, boar: 1, cattle: 1 }),
    ],
  }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
