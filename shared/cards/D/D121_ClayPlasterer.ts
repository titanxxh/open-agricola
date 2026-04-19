import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'D121_ClayPlasterer'

/**
 * D121 Clay Plasterer — Renovating to clay only costs you exactly 1 <CLAY> and 1 <REED>.
 * Each clay room only costs you 3 <CLAY> and 2 <REED> to build.
 *
 * BGA reference:
 * - onPlayerComputeCostsConstruct: for roomClay type, calls Utils::addCost with
 *   [CLAY => 3, REED => 2] as an alternative (discount of 2 clay from base 5 clay + 2 reed).
 * - onPlayerComputeCostsRenovation: for newRoomType=roomClay, removes clay from all trade
 *   cost entries and sets fee clay to 1 (flat 1 clay fee regardless of room count).
 */

const constructCostListener: CardListenerRegistration = {
  id: 'D121-clay-plasterer-compute-costs-construct',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.houseType !== 'clay') return
    // Base cost: 5 clay + 2 reed → discount to 3 clay + 2 reed
    return { costs: { clay: -2 } }
  },
}

const renovationCostListener: CardListenerRegistration = {
  id: 'D121-clay-plasterer-compute-costs-renovation',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Only applies when renovating wood → clay (current house is wood)
    if (context.player.houseType !== 'wood') return
    // Base renovation cost: { clay: rooms, reed: 1 }
    // D121 makes it exactly 1 clay + 1 reed regardless of room count
    // So discount clay by (rooms - 1)
    const rooms = context.player.rooms
    const clayDiscount = rooms - 1
    if (clayDiscount <= 0) return
    return { costs: { clay: -clayDiscount } }
  },
}

registerCardListener(constructCostListener)
registerCardListener(renovationCostListener)

export const D121_ClayPlasterer = new Occupation({
  id: CARD_ID,
  name: 'Clay Plasterer',
  deck: 'D',
  number: 121,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: [
    'Renovating to clay only costs you exactly 1 <CLAY> and 1 <REED>. Each clay room only costs you 3 <CLAY> and 2 <REED> to build.',
  ],
  cost: {},
  players: '1+',
})
