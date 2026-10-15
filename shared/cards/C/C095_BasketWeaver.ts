import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase } from '../../actions/hooks'
import type { CardCostCandidate } from '../../contract/types'
import type { CardImpl } from '../registry'
import { isMajorImprovementPlayable } from '../../actions/helpers/improvement-helpers'

const CARD_ID = 'C095_BasketWeaver'
const TARGET_MAJOR = 'Major_Basket'

const computeCostsListener: CardListenerRegistration = {
  id: 'C95-basket-weaver-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement'],
  deriveCardCostCandidate: (context: CardListenerContext, candidate: CardCostCandidate) => {
    if (context.actionCardId !== CARD_ID) return null
    if (context.cardId !== TARGET_MAJOR) return null
    if (candidate.sources.includes(CARD_ID)) return null
    return {
      resources: { stone: 1, reed: 1 },
      originalFeeIndex: candidate.originalFeeIndex,
      sources: [CARD_ID],
    }
  },
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player, _payment, context) => {
      if (!isMajorImprovementPlayable(state, player, TARGET_MAJOR, CARD_ID, undefined, context?.actionHooks)) return
      return {
        type: 'leaf',
        actionId: 'improvement',
        sourceCard: CARD_ID,
        actionContext: { trueAction: false },
        params: { allowedPurchases: [TARGET_MAJOR] },
      }
    },
  },
  listeners: [computeCostsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C095_BasketWeaver = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Basket Weaver',
    deck: 'C',
    number: 95,
    category: 'ACTIONS_BOOSTER',
    desc: [
        "When you play this card, immediately build the __Basketmaker's Workshop__ major improvement for 1 <STONE> and 1 <REED>.",
      ],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const C095_BasketWeaver_impl = C095_BasketWeaver.impl
