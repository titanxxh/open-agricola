import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { C128_WoodenHutExtender } from '../../cards-display/C/C128_WoodenHutExtender'
export { C128_WoodenHutExtender }

const CARD_ID = C128_WoodenHutExtender.id

/**
 * C128 Wooden Hut Extender — Wood rooms cost 1 reed, and additionally:
 *   - Rounds 1–5:  5 wood + 1 reed  (base 5+2, so -1 reed)
 *   - Rounds 6–7:  4 wood + 1 reed  (base 5+2, so -1 wood -1 reed)
 *   - Round 8+:    3 wood + 1 reed  (base 5+2, so -2 wood -1 reed)
 *
 * BGA reference: onPlayerComputeCostsConstruct calls Utils::addCost to set the full cost
 * based on the current round, only for roomWood type.
 */

const constructCostListener: CardListenerRegistration = {
  id: 'C128-wooden-hut-extender-costs-construct',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.houseType !== 'wood') return
    const round = context.state.round
    // Always reduce reed from 2 to 1 (-1 reed)
    // Additionally reduce wood based on round
    if (round >= 8) {
      return { costs: { wood: -2, reed: -1 } }
    }
    if (round >= 6) {
      return { costs: { wood: -1, reed: -1 } }
    }
    // Rounds 1-5: 5 wood + 1 reed (only reed discount)
    return { costs: { reed: -1 } }
  },
}

export const C128_WoodenHutExtender_impl = {
  listeners: [constructCostListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
