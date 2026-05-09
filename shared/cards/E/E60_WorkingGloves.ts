import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E60_WorkingGloves } from '../../cards-display/E/E60_WorkingGloves'

const CARD_ID = E60_WorkingGloves.id

export const E60_WorkingGloves_impl = {
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { food: 1 }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
