import { getRegisteredMinorImprovement } from '../types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getMajorCard } from '../major'
import { isMajorCardId } from '../helpers/card-type'
import { PaymentSolver } from '../../actions/payment'
import type { CardImpl } from '../registry'
import { E156_ClaypitOwner } from '../../cards-display/E/E156_ClaypitOwner'

const CARD_ID = E156_ClaypitOwner.id

/**
 * E156 Claypit Owner (Occupation, E, 156)
 * Each time another player plays an improvement with a printed clay cost,
 * card owner gets 1 food + 1 clay.
 *
 * BGA: onPlayerAfterBuildImprovement — checks if the built improvement
 * has clay in its printed cost.
 *
 * scope 'opponent' — fires when an opponent plays an improvement with clay cost.
 * Players 4+.
 */

const hasPrintedClayCost = (cardId: string): boolean => {
  if (isMajorCardId(cardId)) {
    const major = getMajorCard(cardId)
    if (major?.cost) {
      const cost = major.cost
      if (PaymentSolver.isComplexCost(cost)) {
        return (cost.fees ?? []).some((fee) => (fee.clay ?? 0) > 0)
          || (cost.fee ? (cost.fee.clay ?? 0) > 0 : false)
      }
      return (cost.clay ?? 0) > 0
    }
    return false
  }

  // Check minor improvements
  const minor = getRegisteredMinorImprovement(cardId)
  if (minor?.cost) {
    const cost = minor.cost as { clay?: number }
    return (cost.clay ?? 0) > 0
  }

  return false
}

const getBuiltCardId = (choice: string | undefined): string | undefined => {
  if (!choice) return undefined
  return choice.replace(/^major:/, '').replace(/^minor:/, '')
}

const listener: CardListenerRegistration = {
  id: 'E156-claypit-owner-opponent-improvement-clay',
  cardIds: [CARD_ID],
  actions: ['improvement-any', 'minor-improvement'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const builtCardId = getBuiltCardId(context.choice)
    if (!builtCardId) return
    if (!hasPrintedClayCost(builtCardId)) return
    return { flow: gainLeaf(CARD_ID, { food: 1, clay: 1 }), sourceCard: CARD_ID }
  },
}

export const E156_ClaypitOwner_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
