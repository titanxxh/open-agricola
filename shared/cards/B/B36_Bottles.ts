import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'B36_Bottles'

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
  actions: ['minor-improvement', 'improvement-any'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.cardId !== CARD_ID) return
    const farmers = context.player.familySize
    return { costs: { clay: farmers, food: farmers } }
  },
}

registerCardListener(computeCostsListener)

export const B36_Bottles = new MinorImprovement({
  id: CARD_ID,
  name: 'Bottles',
  deck: 'B',
  number: 36,
  category: 'POINTS_PROVIDER',
  desc: ['For each person you have, you must pay an additional 1 <CLAY> and 1 <FOOD> to play this card.'],
  cost: {},
  vp: 4,
})
