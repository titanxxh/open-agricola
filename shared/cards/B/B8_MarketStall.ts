import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B8_MarketStall'

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { vegetable: 1 }),
})

export const B8_MarketStall = new MinorImprovement({
  id: CARD_ID,
  name: "Market Stall",
  deck: "B",
  number: 8,
  category: "CROP_PROVIDER",
  desc: ["You immediately get 1 <VEGETABLE>. (Effectively, you are exchanging 1 <GRAIN> for 1 <VEGETABLE>)."],
  cost: { grain: 1 },
  passing: true,
})
