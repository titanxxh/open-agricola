import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { D15_ClaySupports } from '../../cards-display/D/D15_ClaySupports'
export { D15_ClaySupports }

const CARD_ID = D15_ClaySupports.id

/**
 * D15 Clay Supports — Each time you build a clay room, you can pay
 * 2 <CLAY>, 1 <WOOD>, and 1 <REED> instead of 5 <CLAY> and 2 <REED>.
 *
 * BGA reference: onPlayerComputeCostsConstruct pushes [CLAY=>2, WOOD=>1, REED=>1]
 * as an alternative trade option for roomClay type.
 *
 * Simplified implementation: applies a mandatory cost adjustment of
 * { clay: -3, reed: -1, wood: +1 } so the effective cost is 2 clay + 1 wood + 1 reed.
 * This is always more efficient if the player has wood available.
 */

const constructCostListener: CardListenerRegistration = {
  id: 'D15-clay-supports-compute-costs-construct',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.houseType !== 'clay') return
    // Base cost: 5 clay + 2 reed → alternative: 2 clay + 1 wood + 1 reed
    return { costs: { clay: -3, reed: -1, wood: 1 } }
  },
}

export const D15_ClaySupports_impl = {
  listeners: [constructCostListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
