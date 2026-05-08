import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B37_Grange } from '../../cards-display/B/B37_Grange'
export { B37_Grange }

const CARD_ID = B37_Grange.id

export const B37_Grange_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { food: 1 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
