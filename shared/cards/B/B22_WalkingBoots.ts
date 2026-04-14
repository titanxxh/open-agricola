import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B22_WalkingBoots'

// BGA: get 2 food, then immediately place a person from supply who will be removed at next return home.
// Simplified: gain 2 food only. TODO: implement temporary farmer placement with removal.
registerCardEffect({
  id: CARD_ID,
  onBuy: (_state, _player) => gainLeaf(CARD_ID, { food: 2 }),
})

export const B22_WalkingBoots = new MinorImprovement({
  id: CARD_ID,
  name: 'Walking Boots',
  deck: 'B',
  number: 22,
  category: 'ACTION_ENHANCER',
  desc: ['You immediately get 2 <FOOD>. You must immediately place a person from your supply. If you do, in the next returning home phase, you must remove that person from play.'],
  cost: {},
  prerequisite: 'At Most 4 People',
  passing: true,
})
