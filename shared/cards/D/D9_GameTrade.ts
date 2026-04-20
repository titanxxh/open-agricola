import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D9_GameTrade'

export const D9_GameTrade = new MinorImprovement({
  id: CARD_ID,
  name: 'Game Trade',
  deck: 'D',
  number: 9,
  category: 'FOOD_ANIMAL',
  desc: ['You immediately get 1 <PIG> and 1 <CATTLE>. (effectively, you are exchanging 2 <SHEEP> for 1 <PIG> and 1 <CATTLE>.)'],
  cost: { sheep: 2 },
  passing: true,
})

export const D9_GameTrade_impl = {
  effect: {
  id: CARD_ID,
  // Cost of 2 sheep is paid at buy time via card cost field.
  // onBuy grants 1 pig + 1 cattle.
  onBuy: () => gainLeaf(CARD_ID, { boar: 1, cattle: 1 }),
},
  reaches: [] as readonly string[],
} satisfies CardImpl
