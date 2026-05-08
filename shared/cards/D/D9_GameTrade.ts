import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D9_GameTrade } from '../../cards-display/D/D9_GameTrade'

const CARD_ID = D9_GameTrade.id

export const D9_GameTrade_impl = {
  effect: {
  id: CARD_ID,
  // Cost of 2 sheep is paid at buy time via card cost field.
  // onBuy grants 1 pig + 1 cattle.
  onBuy: () => gainLeaf(CARD_ID, { boar: 1, cattle: 1 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
