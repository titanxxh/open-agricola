import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A16_RammedClay } from '../../cards-display/A/A16_RammedClay'

const CARD_ID = A16_RammedClay.id

export const A16_RammedClay_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { clay: 1 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
