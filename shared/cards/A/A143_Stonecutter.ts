import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { A143_Stonecutter } from '../../cards-display/A/A143_Stonecutter'

const CARD_ID = A143_Stonecutter.id

/**
 * A143 Stonecutter — Every improvement, room, and renovation costs you 1 stone less.
 *
 * BGA reference: onPlayerComputeCardCosts (improvements), onPlayerComputeCostsConstruct,
 * onPlayerComputeCostsRenovation.
 *
 * For construct and renovation we use BonusModifier (the modifier system).
 * For improvements (majors/minors) we use a computeCosts listener on improvement-any.
 */

const improvementCostListener: CardListenerRegistration = {
  id: 'A143-stonecutter-costs-improvement',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { costs: { stone: -1 } }
  },
}

export const A143_Stonecutter_impl = {
  listeners: [improvementCostListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
