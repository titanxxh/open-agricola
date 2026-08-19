import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardCostCandidate } from '../../contract/types'
import type { CardImpl } from '../registry'
import { PaymentSolver } from '../../actions/payment'

const CARD_ID = 'D117_WoodExpert'
/**
 * D117 Wood Expert — Occupation.
 * When you play this card, you immediately get 2 wood.
 * Each improvement costs you up to 2 wood less, if you pay 1 food instead.
 *
 * Rule: onBuy → gain 2 wood.
 * onPlayerComputeCardCosts → for each major/minor cost candidate containing wood,
 *   appends an alternative candidate: -2 wood (clamped to 0) +1 food.
 */

const computeCostsListener: CardListenerRegistration = {
  id: 'D117-wood-expert-compute-costs-improvement',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement'],
  deriveCardCostCandidate: (_context, candidate: CardCostCandidate) => {
    if (candidate.resources.wood === undefined) return null
    const beforeWood = candidate.resources.wood ?? 0
    const afterWood = Math.max(0, beforeWood - 2)
    const resources = {
      ...candidate.resources,
      food: (candidate.resources.food ?? 0) + 1,
    }
    if (afterWood === 0) {
      delete resources.wood
    } else {
      resources.wood = afterWood
    }
    return PaymentSolver.addCardCostCandidateAttribution(
      {
        ...candidate,
        resources,
      },
      CARD_ID,
      {
        saved: { wood: beforeWood - afterWood },
        paid: { food: 1 },
      },
    )
  },
}

const cardImpl = {
  listeners: [computeCostsListener],
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { wood: 2 }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D117_WoodExpert = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Wood Expert',
    deck: 'D',
    number: 117,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: [
        'When you play this card, you immediately get 2 <WOOD>. Each improvement costs you up to 2 <WOOD> less, if you pay 1 <FOOD> instead.',
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const D117_WoodExpert_impl = D117_WoodExpert.impl
