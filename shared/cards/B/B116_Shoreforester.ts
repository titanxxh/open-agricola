import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B116_Shoreforester'

/**
 * B116 Shoreforester (Occupation):
 * When you play this card, you immediately get 1 Wood.
 * Each round during the preparation phase (when reed is placed on Reed Bank),
 * you get 1 Wood.
 *
 * We use onRoundStart which fires each round — effectively granting 1 Wood
 * every round.
 */

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { wood: 1 }),
  onRoundStart: (_state, _player) => {
    return gainLeaf(CARD_ID, { wood: 1 })
  },
})

export const B116_Shoreforester = new Occupation({
  id: CARD_ID,
  name: 'Shoreforester',
  deck: 'B',
  number: 116,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'When you play this card and each time 1 <REED> is placed on an empty __Reed Bank__ accumulation space in the preparation phase, you get 1 <WOOD>.',
  ],
  cost: {},
  players: '1+',
  newSet: true,
})
