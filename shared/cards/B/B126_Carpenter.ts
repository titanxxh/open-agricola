import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { B126_Carpenter } from '../../cards-display/B/B126_Carpenter'

const CARD_ID = B126_Carpenter.id

/**
 * B126 Carpenter — Every new room only costs 3 of the appropriate building resource
 * and 2 reed (instead of the standard 5+2).
 *
 * BGA reference: onPlayerComputeCostsConstruct calls Utils::addCost with [res => 3, REED => 2].
 * Base cost is 5+2, so we apply -2 to the room material.
 */

const constructCostListener: CardListenerRegistration = {
  id: 'B126-carpenter-costs-construct',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const houseType = context.player.houseType
    if (houseType === 'clay') return { costs: { clay: -2 } }
    if (houseType === 'stone') return { costs: { stone: -2 } }
    return { costs: { wood: -2 } }
  },
}

export const B126_Carpenter_impl = {
  listeners: [constructCostListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
