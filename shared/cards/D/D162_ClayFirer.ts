import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D162_ClayFirer'

registerCardEffect({
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { clay: 2 }),
})

export const D162_ClayFirer = new Occupation({
  id: CARD_ID,
  name: 'Clay Firer',
  deck: 'D',
  number: 162,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'When you play this card, you immediately get 2 <CLAY>. At any time, you can turn <CLAY> into <STONE>: you get 1 <STONE> for 2 <CLAY>, and 2 <STONE> for 3 <CLAY>.',
  ],
  cost: {},
  players: '4+',
  exchanges: [
    { from: { clay: 2 }, to: { stone: 1 }, trigger: 'anytime' },
    { from: { clay: 3 }, to: { stone: 2 }, trigger: 'anytime' },
  ],
})
