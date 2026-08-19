import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { PaymentSolver } from '../../actions/payment'

const CARD_ID = 'A075_LumberMill'
/**
 * A75 Lumber Mill — Every improvement costs you 1 wood less.
 * Rule: onPlayerComputeCardCosts, applies to MAJOR and MINOR types.
 */
const computeCostsListener: CardListenerRegistration = {
  id: 'A75-lumber-mill-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement'],
  deriveCardCostCandidate: (_context, candidate) =>
    PaymentSolver.discountCardCostCandidate(candidate, CARD_ID, { wood: 1 }),
}

const cardImpl = {
  listeners: [computeCostsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A075_LumberMill = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Lumber Mill',
    deck: 'A',
    number: 75,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['Every improvement costs you 1 <WOOD> less.'],
    cost: { stone: 2 },
    vp: 2,
    prerequisite: 'At most 3 Occupations',
    occupationPrerequisites: { max: 3 },
  },
  impl: cardImpl,
})

export const A075_LumberMill_impl = A075_LumberMill.impl
