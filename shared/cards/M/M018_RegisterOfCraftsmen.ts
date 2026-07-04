import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import type { ActionHookPhase } from '../../actions/hooks'
import type { CardListenerRegistration } from '../card-listeners'
import { PaymentSolver } from '../../actions/payment'
import { isMajorImprovementPlayable } from '../../actions/helpers/improvement-helpers'

const CARD_ID = 'M018_RegisterOfCraftsmen'
const TARGETS = ['Major_Joinery', 'Major_Pottery', 'Major_Basket'] as const

const costListener: CardListenerRegistration = {
  id: 'M018-register-of-craftsmen-costs-improvement',
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement'],
  deriveCardCostCandidate: (context, candidate) => {
    if (context.actionCardId !== CARD_ID) return null
    if (!context.cardId || !TARGETS.includes(context.cardId as typeof TARGETS[number])) return null
    return PaymentSolver.discountCardCostCandidate(candidate, CARD_ID, { stone: 1 })
  },
}

const cardImpl = {
  listeners: [costListener],
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      const allowedPurchases = TARGETS.filter((id) =>
        isMajorImprovementPlayable(state, player, id, CARD_ID, [...TARGETS]),
      )
      if (allowedPurchases.length === 0) return
      return {
        type: 'leaf' as const,
        actionId: 'improvement',
        sourceCard: CARD_ID,
        params: { types: ['major'], allowedPurchases, trueAction: false },
        actionContext: { trueAction: false },
      }
    },
  },
  reaches: TARGETS,
} satisfies CardImpl

export const M018_RegisterOfCraftsmen = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Register of Craftsmen",
    deck: "M",
    number: 18,
    category: "ACTIONS_BOOSTER",
    desc: [
        "Immediately acquire your choice of the Joinery, Pottery, or Basketmaker's Workshop without placing a person. You pay 1 stone less for it."
    ],
    cost: {},
    prerequisite: "2 Major Improvements",
    passing: true,
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M018_RegisterOfCraftsmen_impl = M018_RegisterOfCraftsmen.impl
