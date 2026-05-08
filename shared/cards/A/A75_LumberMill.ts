import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { A75_LumberMill } from '../../cards-display/A/A75_LumberMill'
export { A75_LumberMill }

const CARD_ID = A75_LumberMill.id

/**
 * A75 Lumber Mill — Every improvement costs you 1 wood less.
 * BGA: onPlayerComputeCardCosts, applies to MAJOR and MINOR types.
 */
const computeCostsListener: CardListenerRegistration = {
  id: 'A75-lumber-mill-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { costs: { wood: -1 } }
  },
}

export const A75_LumberMill_impl = {
  listeners: [computeCostsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
