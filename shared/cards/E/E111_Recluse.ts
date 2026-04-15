import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E111_Recluse'

/**
 * E111 Recluse
 * As long as you have no minor improvements in front of you,
 * you get 1 food at the start of each round and
 * 1 wood at the start of each harvest.
 *
 * BGA: checks getCards(MINOR, true)->count() == 0.
 * StartOfTurn → 1 food. StartHarvest → 1 wood.
 */

registerCardEffect({
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    if (player.minorPlayed.length > 0) return
    return gainLeaf(CARD_ID, { food: 1 })
  },
  onStartHarvest: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    if (player.minorPlayed.length > 0) return
    return gainLeaf(CARD_ID, { wood: 1 })
  },
})

export const E111_Recluse = new Occupation({
  id: CARD_ID,
  name: 'Recluse',
  deck: 'E',
  number: 111,
  category: 'FOOD',
  desc: [
    'As long as you have no minor improvements in front of you, you get 1 <FOOD> at the start of each round and 1 <WOOD> at the start of each harvest.',
  ],
  cost: {},
  players: '1+',
})
