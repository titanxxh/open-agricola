import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { constructUnitDiscountTrade } from '../helpers/construct-cost'
import {
  selectedRenovationTarget,
  sourcedMandatoryBonus,
} from '../helpers/renovation-cost'

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
    return { trades: [constructUnitDiscountTrade(CARD_ID, { clay: 2 })] }
  },
}

const renovationCostListener: CardListenerRegistration = {
  id: 'D121-clay-plasterer-compute-costs-renovation',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.houseType !== 'wood') return
    if (selectedRenovationTarget(context) !== 'clay') return
    const rooms = context.player.rooms
    const clayDiscount = rooms - 1
    if (clayDiscount <= 0) return
    return { bonuses: [sourcedMandatoryBonus(CARD_ID, { clay: clayDiscount })] }
  },
}

const cardImpl = {
  listeners: [constructCostListener, renovationCostListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D121_ClayPlasterer = defineOccupationCard({
  meta: {
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
  },
  impl: cardImpl,
})

export const D121_ClayPlasterer_impl = D121_ClayPlasterer.impl
