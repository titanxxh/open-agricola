import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'
import { isSpaceOccupied } from '../../game/space'

const CARD_ID = 'B160_PubOwner'

/**
 * B160 Pub Owner (Occupation):
 * When you play this card, you immediately get 1 Grain.
 * At the end of each work phase in which the Forest, Clay Pit, and Reed Bank
 * accumulation spaces are all occupied, you get 1 Grain.
 *
 * BGA fires this at EndWorkPhase; we use onBeforeReturnHome.
 */

registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { grain: 1 }),
  onBeforeReturnHome: (state, _player) => {
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    const reedBank = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (!forest || !clayPit || !reedBank) return
    if (!isSpaceOccupied(forest) || !isSpaceOccupied(clayPit) || !isSpaceOccupied(reedBank)) return
    return gainLeaf(CARD_ID, { grain: 1 })
  },
})

export const B160_PubOwner = new Occupation({
  id: CARD_ID,
  name: 'Pub Owner',
  deck: 'B',
  number: 160,
  category: 'CROP_PROVIDER',
  desc: [
    'When you play this card and at the end of each work phase in which the __Forest__, __Clay Pit__, and __Reed Bank__ accumulation spaces are all occupied, you get 1 <GRAIN>.',
  ],
  cost: {},
  players: '4+',
  newSet: true,
})
