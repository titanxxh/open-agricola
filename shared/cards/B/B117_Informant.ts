import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B117_Informant'

/**
 * B117 Informant (Occupation):
 * When you play this card, you immediately get 1 Wood.
 * After each work phase, if you have more Stone than Clay in your supply,
 * you get 1 Wood.
 *
 * BGA fires this at AfterWorkPhase; we use onBeforeReturnHome.
 * Card is marked as banned in BGA.
 */

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { wood: 1 }),
  onBeforeReturnHome: (_state, player) => {
    if (player.resources.stone <= player.resources.clay) return
    return gainLeaf(CARD_ID, { wood: 1 })
  },
})

export const B117_Informant = new Occupation({
  id: CARD_ID,
  name: 'Informant',
  deck: 'B',
  number: 117,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'When you play this card, you immediately get 1 <WOOD>. After each work phase, if you have more <STONE> than <CLAY> in your supply, you get 1 <WOOD>.',
  ],
  cost: {},
  players: '1+',
  newSet: true,
})
