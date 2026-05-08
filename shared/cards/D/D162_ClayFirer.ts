import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D162_ClayFirer } from '../../cards-display/D/D162_ClayFirer'
export { D162_ClayFirer }

const CARD_ID = D162_ClayFirer.id

export const D162_ClayFirer_impl = {
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { clay: 2 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
