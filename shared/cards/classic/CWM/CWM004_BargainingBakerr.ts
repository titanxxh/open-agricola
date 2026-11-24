import { PaymentSolver } from '../../../actions/payment'
import { defineOccupationCard } from '../../card-source'
import { getCardDefinitionById } from '../../helpers/card-type'
import { gainLeaf } from '../../helpers/pay-gain-node'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM004_BargainingBakerr'
const buildingResources = ['wood', 'clay', 'reed', 'stone'] as const

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-before-baking-improvement',
      cardIds: [CARD_ID],
      actions: ['pay'],
      phases: ['before'],
      mandatory: true,
      handler: ({ actionContext, sourceCard }) => {
        if (actionContext?.improvementKind !== 'major' && actionContext?.improvementKind !== 'minor') return
        if (sourceCard && getCardDefinitionById(sourceCard)?.isBaking) {
          return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
        }
      },
    },
    {
      id: CARD_ID + '-oven-discount',
      cardIds: [CARD_ID],
      actions: ['improvement'],
      phases: ['computeCosts'],
      cardCostCandidateMandatory: true,
      deriveCardCostCandidate: ({ cardId }, candidate) => {
        const card = cardId && getCardDefinitionById(cardId)
        // The printed rule defines an Oven by its baking symbol and printed name.
        if (!card || !card.isBaking || !card.name.includes('Oven')) return null
        return buildingResources.flatMap(resource => {
          if (!candidate.resources[resource]) return []
          const option = PaymentSolver.discountCardCostCandidate(candidate, CARD_ID, { [resource]: 1 })
          return option ? [option] : []
        })
      },
    },
  ],
} satisfies CardImpl

export const CWM004_BargainingBakerr = defineOccupationCard({
  meta: {
    id: 'CWM004_BargainingBakerr',
    name: 'Bargaining Baker',
    deck: 'CWM',
    number: 4,
    players: '1+',
    cost: {},
    desc: [
      'Whenever you build an oven, pay 1 building resource of your choice less. Before you build an improvement with a baking symbol, you receive 1 <GRAIN>. An oven is an improvement with a baking symbol and “Oven” in its name.',
    ],
    artUrl: 'assets/classic/CWM/CWM004.png',
    implemented: true,
  },
  impl: cardImpl,
})
