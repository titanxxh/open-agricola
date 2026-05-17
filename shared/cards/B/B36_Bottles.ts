import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'
import { B36_Bottles } from '../../cards-display/B/B36_Bottles'

const CARD_ID = B36_Bottles.id

/**
 * B36 Bottles (Minor Improvement):
 * Worth 4 VP. Dynamic cost: for each person you have, pay 1 clay + 1 food.
 *
 * BGA reference:
 * - getBaseCosts: clay = farmers, food = farmers
 * - vp: 4
 */

// computeCosts: set cost to (familySize * clay) + (familySize * food)
// The base cost on the card is {} (empty), so the listener adds the full dynamic cost.
const computeCostsListener: CardListenerRegistration = {
  id: 'B36-bottles-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.cardId !== CARD_ID) return
    const farmers = familySize(context.player)
    return { costs: { clay: farmers, food: farmers } }
  },
}

export const B36_Bottles_impl = {
  listeners: [computeCostsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
