import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D131_CraftsmanshipPromoter'

registerCardEffect({
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { stone: 1 }),
  // TODO: allow building major improvements (bottom row) via Minor Improvement action
})

export const D131_CraftsmanshipPromoter = new Occupation({
  id: CARD_ID,
  name: 'Craftsmanship Promoter',
  deck: 'D',
  number: 131,
  category: 'ACTIONS_BOOSTER',
  desc: ['When you play this card, you immediately get 1 <STONE>. You can build any of the major improvements in the bottom row of the supply board even when taking a __Minor Improvement__ action.'],
  cost: {},
  players: '3+',
  newSet: true,
})
