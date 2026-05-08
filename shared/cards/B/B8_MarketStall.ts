import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B8_MarketStall } from '../../cards-display/B/B8_MarketStall'
export { B8_MarketStall }

const CARD_ID = B8_MarketStall.id

export const B8_MarketStall_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { vegetable: 1 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
