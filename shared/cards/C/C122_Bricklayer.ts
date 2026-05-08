import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { C122_Bricklayer } from '../../cards-display/C/C122_Bricklayer'
export { C122_Bricklayer }

const CARD_ID = C122_Bricklayer.id

/**
 * C122 Bricklayer — Each improvement and each renovation cost you 1 clay less.
 * Each room costs you 2 clay less.
 *
 * BGA reference: onPlayerComputeCardCosts (improvements -1 clay),
 * onPlayerComputeCostsConstruct (rooms -2 clay),
 * onPlayerComputeCostsRenovation (-1 clay).
 */

const improvementCostListener: CardListenerRegistration = {
  id: 'C122-bricklayer-costs-improvement',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { costs: { clay: -1 } }
  },
}

export const C122_Bricklayer_impl = {
  listeners: [improvementCostListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
