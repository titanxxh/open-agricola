import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { playerHasCardCapability } from '../helpers/card-type'
import type { CardCostCandidate } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'A027_OvenSite'
const OVEN_IDS = ['Major_ClayOven', 'Major_StoneOven'] as const

const computeCostsListener: CardListenerRegistration = {
  id: 'A27-oven-site-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement'],
  cardCostCandidateMandatory: true,
  deriveCardCostCandidate: (context: CardListenerContext, candidate: CardCostCandidate) => {
    if (context.actionCardId !== CARD_ID) return null
    if (!context.cardId) return null
    if (!OVEN_IDS.includes(context.cardId as (typeof OVEN_IDS)[number])) return null
    if (candidate.sources.includes(CARD_ID)) return null
    return {
      resources: { clay: 1, stone: 1 },
      originalFeeIndex: candidate.originalFeeIndex,
      sources: [CARD_ID],
    }
  },
}

const cardImpl = {
  listeners: [computeCostsListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, _player) => ({
    type: 'seq',
    children: [
      gainLeaf(CARD_ID, { wood: 2 }),
      {
        type: 'leaf',
        actionId: 'improvement',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { trueAction: false },
        params: {
          allowedPurchases: [...OVEN_IDS],
        },
      },
    ],
  }),
},
  prerequisiteCheck: (player) => {
    const hasFireplace = playerHasCardCapability(player, 'fireplaceIdentity', { asType: 'major' })
    const hasHearth = playerHasCardCapability(player, 'cookingHearthIdentity', { asType: 'major' })
    return hasFireplace && hasHearth
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A027_OvenSite = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Oven Site',
    deck: 'A',
    number: 27,
    category: 'ACTIONS_BOOSTER',
    desc: [
        'When you play this card, you get 2 <WOOD> and you can immediately build the __Clay Oven__ or __Stone Oven__ major improvement. Either way, it only costs you 1 <CLAY> and 1 <STONE>.',
      ],
    prerequisite: 'Both Fireplace and Cooking Hearth',
    cost: {},
  },
  impl: cardImpl,
})

export const A027_OvenSite_impl = A027_OvenSite.impl
