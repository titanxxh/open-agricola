import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D81_RoofLadder'

// D81 Roof Ladder: Each time you renovate, you pay 1 fewer reed and, at the end of the
// action, you get 1 stone.
// BGA: onPlayerComputeCostsRenovation (Utils::addBonus reed -1) +
//      onPlayerAfterRenovation (gain 1 stone)

const costListener: CardListenerRegistration = {
  id: 'D81-roof-ladder-compute-costs-renovation',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { costs: { reed: -1 } }
  },
}

const afterListener: CardListenerRegistration = {
  id: 'D81-roof-ladder-after-renovation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { stone: 1 }), sourceCard: CARD_ID }
  },
}

registerCardListener(costListener)
registerCardListener(afterListener)

export const D81_RoofLadder = new MinorImprovement({
  id: CARD_ID,
  name: 'Roof Ladder',
  deck: 'D',
  number: 81,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Each time you renovate, you pay 1 fewer <REED> and, at the end of the action, you get 1 <STONE>.',
  ],
  cost: { wood: 1 },
  newSet: true,
})
