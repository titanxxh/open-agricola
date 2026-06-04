import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'

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
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.cardId !== CARD_ID) return
    const farmers = familySize(context.player)
    return { costs: { clay: farmers, food: farmers } }
  },
}

const cardImpl = {
  listeners: [computeCostsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B36_Bottles = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Bottles',
    deck: 'B',
    number: 36,
    category: 'POINTS_PROVIDER',
    desc: ['For each person you have, you must pay an additional 1 <CLAY> and 1 <FOOD> to play this card.'],
    cost: {},
    vp: 4,
  },
  impl: cardImpl,
})

export const B36_Bottles_impl = B36_Bottles.impl
