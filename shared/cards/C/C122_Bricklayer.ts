import { defineOccupationCard } from '../card-source'
import type { BonusModifier } from '../../contract/types'
import type { CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { PaymentSolver } from '../../actions/payment'

const CARD_ID = 'C122_Bricklayer'
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
  actions: ['improvement'],
  deriveCardCostCandidate: (_context, candidate) =>
    PaymentSolver.discountCardCostCandidate(candidate, CARD_ID, { clay: 1 }),
}

const cardImpl = {
  listeners: [improvementCostListener],
  modifiers: [
    {
      type: 'bonus',
      cardId: CARD_ID,
      appliesTo: ['construct'],
      discount: { clay: 2 },
    },
    {
      type: 'bonus',
      cardId: CARD_ID,
      appliesTo: ['renovation'],
      discount: { clay: 1 },
      optional: false,
    },
  ] as BonusModifier[],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C122_Bricklayer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Bricklayer',
    deck: 'C',
    number: 122,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['Each improvement and each renovation cost you 1 <CLAY> less. Each room costs you 2 <CLAY> less.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const C122_Bricklayer_impl = C122_Bricklayer.impl
