import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D62_BeerTap } from '../../cards-display/D/D62_BeerTap'
export { D62_BeerTap }

const CARD_ID = D62_BeerTap.id

export const D62_BeerTap_impl = {
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { food: 2 }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
