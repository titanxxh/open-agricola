import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D88_Millwright } from '../../cards-display/D/D88_Millwright'

const CARD_ID = D88_Millwright.id

export const D88_Millwright_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { grain: 1 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
