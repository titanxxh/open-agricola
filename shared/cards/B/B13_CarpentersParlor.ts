import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { B13_CarpentersParlor } from '../../cards-display/B/B13_CarpentersParlor'

const CARD_ID = B13_CarpentersParlor.id

/**
 * B13 Carpenter's Parlor — Wooden rooms only cost you 2 wood and 2 reed each
 * (instead of the standard 5 wood + 2 reed).
 *
 * BGA reference: onPlayerComputeCostsConstruct sets cost to [WOOD => 2, REED => 2]
 * for roomWood type. Base is 5 wood + 2 reed, so discount is -3 wood.
 */

const constructCostListener: CardListenerRegistration = {
  id: 'B13-carpenters-parlor-costs-construct',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.houseType !== 'wood') return
    return { costs: { wood: -3 } }
  },
}

export const B13_CarpentersParlor_impl = {
  listeners: [constructCostListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
