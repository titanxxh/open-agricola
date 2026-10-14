import { PaymentSolver } from '../../actions/payment'
import { gainLeaf } from '../helpers/pay-gain-node'
import { defineMinorCard } from '../card-source'

const CARD_ID = 'E060_WorkingGloves'
const buildingResources = ['wood', 'clay', 'reed', 'stone'] as const

export const E060_WorkingGloves = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Working Gloves',
    deck: 'E',
    number: 60,
    category: 'FOOD_-_CONVERT',
    desc: [
      'When you play this card, you get 1 <FOOD>. Each time you pay an occupation cost, you can pay 1 building resource of your choice in place of (up to) 2 <FOOD>.',
    ],
    cost: {},
  },
  impl: {
    effect: {
      id: CARD_ID,
      onBuy: () => gainLeaf(CARD_ID, { food: 1 }),
    },
    listeners: [{
      id: 'E60-working-gloves-occupation-cost',
      cardIds: [CARD_ID],
      phases: ['computeCosts'],
      actions: ['occupation'],
      deriveCardCostCandidate: (_context, candidate) => {
        if (candidate.sources.includes(CARD_ID)) return null
        const discounted = PaymentSolver.discountCardCostCandidate(candidate, CARD_ID, { food: 2 })
        if (!discounted) return null
        return buildingResources.map(material => PaymentSolver.addCardCostCandidateAttribution({
          ...discounted,
          resources: { ...discounted.resources, [material]: (discounted.resources[material] ?? 0) + 1 },
        }, CARD_ID, { paid: { [material]: 1 } }))
      },
    }],
    reaches: [] as readonly string[],
  },
})

export const E060_WorkingGloves_impl = E060_WorkingGloves.impl
