import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getCardDefinitionById } from '../../helpers/card-type'
import { PaymentSolver } from '../../../actions/payment'

const CARD_ID = 'CWM004_BargainingBakerr'

const cardImpl = {
  effect: {
    id: CARD_ID,
    computePurchaseResourceGrants: (_state, _player, purchase) =>
      getCardDefinitionById(purchase.cardId)?.isBaking ? [{ grain: 1 }] : [],
  },
  listeners: [
    {
      id: CARD_ID + '-oven-discount',
      cardIds: [CARD_ID],
      actions: ['improvement'],
      phases: ['computeCosts'],
      cardCostCandidateMandatory: true,
      deriveCardCostCandidate: ({ cardId }, candidate) => {
        if (
          !getCardDefinitionById(cardId ?? '')?.ovenIdentity ||
          candidate.sources.includes(CARD_ID)
        )
          return null
        return (['wood', 'clay', 'reed', 'stone'] as const)
          .filter((resource) => (candidate.resources[resource] ?? 0) > 0)
          .flatMap((resource) => {
            const discounted = PaymentSolver.discountCardCostCandidate(candidate, CARD_ID, {
              [resource]: 1,
            })
            return discounted ? [discounted] : []
          })
      },
    },
  ],
} satisfies CardImpl

export const CWM004_BargainingBakerr = defineOccupationCard({
  meta: {
    id: 'CWM004_BargainingBakerr',
    name: "Bargaining Baker",
    deck: 'CWM',
    number: 4,
    desc: ["Immediately before you play a baking improvement, you get 1 grain. Each oven costs you 1 building resource of your choice less."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM004.png',
  },
  impl: cardImpl,
})

export const CWM004_BargainingBakerr_impl = CWM004_BargainingBakerr.impl
