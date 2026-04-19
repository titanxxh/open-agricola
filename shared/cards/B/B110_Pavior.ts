import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B110_Pavior'

/**
 * B110 Pavior (Occupation):
 * At the end of each preparation phase, if you have at least 1 Stone in your
 * supply, you get 1 Food. In round 14, you get 1 Vegetable instead.
 *
 * We use onRoundStart which fires at the start of each round (closest to
 * end-of-preparation-phase in our engine).
 */

registerCardEffect({
  id: CARD_ID,
  onRoundStart: (state, player) => {
    if (player.resources.stone < 1) return
    const resource = state.round === 14 ? 'vegetable' : 'food'
    return gainLeaf(CARD_ID, { [resource]: 1 })
  },
})

export const B110_Pavior = new Occupation({
  id: CARD_ID,
  name: 'Pavior',
  deck: 'B',
  number: 110,
  category: 'FOOD_PROVIDER',
  desc: [
    'At the end of each preparation phase, if you have at least 1 <STONE> in your supply, you get 1 <FOOD>. In round 14, you get 1 <VEGETABLE> instead.',
  ],
  cost: {},
  players: '1+',
  newSet: true,
})
