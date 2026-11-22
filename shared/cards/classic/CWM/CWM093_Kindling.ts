import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { majorCardDefinitionsList } from '../../major/generated'
import { isMajorImprovementAvailable } from '../../major/supply'
import { PaymentSolver } from '../../../actions/payment'

const CARD_ID = 'CWM093_Kindling'

const hearths = majorCardDefinitionsList
  .filter((card) => card.fireplaceIdentity || card.cookingHearthIdentity)
  .map((card) => card.id)
const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-minor-hearths',
      cardIds: [CARD_ID],
      actions: ['improvement'],
      phases: ['computeChoiceCandidates'],
      handler: ({ state }) => ({
        sourceCard: CARD_ID,
        extraOptions: hearths
          .filter((id) => isMajorImprovementAvailable(state, id))
          .map((id) => ({
            value: id,
            labelKey: 'improvements.' + id + '.name',
            sourceCard: CARD_ID,
          })),
      }),
    },
    {
      id: CARD_ID + '-clay-discount',
      cardIds: [CARD_ID],
      actions: ['improvement'],
      phases: ['computeCosts'],
      cardCostCandidateMandatory: true,
      deriveCardCostCandidate: ({ cardId }, candidate) =>
        hearths.includes(cardId ?? '')
          ? PaymentSolver.discountCardCostCandidate(candidate, CARD_ID, { clay: 1 })
          : null,
    },
  ],
} satisfies CardImpl

export const CWM093_Kindling = defineMinorCard({
  meta: {
    id: 'CWM093_Kindling',
    name: "Kindling",
    deck: 'CWM',
    number: 93,
    desc: ["Fireplaces and Cooking Hearths count as minor improvements for you and cost 1 <CLAY> less."],
    cost: {
      wood: 1,
    },
    vp: 0,
    prerequisite: "",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM093.png',
  },
  impl: cardImpl,
})

export const CWM093_Kindling_impl = CWM093_Kindling.impl
