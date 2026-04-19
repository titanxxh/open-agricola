import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getRoundPlacementOrder } from '../helpers/round-placement'

const CARD_ID = 'C119_SkillfulRenovator'

/**
 * C119 Skillful Renovator:
 * onBuy: gain 1 wood + 1 clay.
 * Each time after you renovate, you get a number of WOOD equal to the number of
 * people you placed that round.
 *
 * BGA: countPlacedFarmers() counts farmers placed in the current round.
 * We use getRoundPlacementOrder which tracks placements per round.
 */
registerCardEffect({
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { wood: 1, clay: 1 }),
})

const afterRenovateListener: CardListenerRegistration = {
  id: 'C119-skillful-renovator-after-renovate',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const placed = getRoundPlacementOrder(context.player).length
    if (placed <= 0) return
    return { flow: gainLeaf(CARD_ID, { wood: placed }), sourceCard: CARD_ID }
  },
}

registerCardListener(afterRenovateListener)

export const C119_SkillfulRenovator = new Occupation({
  id: CARD_ID,
  name: 'Skillful Renovator',
  deck: 'C',
  number: 119,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'When you play this card, you immediately get 1 <WOOD> and 1 <CLAY>. Each time after you renovate, you get a number of <WOOD> equal to the number of people you placed that round.',
  ],
  cost: {},
  players: '1+',
})
