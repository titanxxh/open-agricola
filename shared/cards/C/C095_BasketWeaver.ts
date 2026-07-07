import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardCostCandidate } from '../../contract/types'
import type { CardImpl } from '../registry'
import { isMajorImprovementAvailable } from '../major/supply'

const CARD_ID = 'C095_BasketWeaver'
const TARGET_MAJOR = 'Major_Basket'

/**
 * C95 Basket Weaver (Occupation, 1+ players).
 *
 * BGA (C095_BasketWeaver.php): When you play this card, immediately build the
 * Basketmaker's Workshop (Major_Basket) for 1 STONE and 1 REED instead of the
 * normal 2 REED + 2 STONE cost.
 *
 * BGA implementation:
 *   - onBuy → flag card, perform improvement action limited to Major_Basket
 *     with trueAction=false, unflag.
 *   - onPlayerComputeCardCosts: if flagged AND target is Major_Basket, override
 *     trades to { stone: 1, reed: 1 }.
 *
 * Here:
 *   - occupation after-listener triggered when this card is played →
 *     offer optional improvement-any with allowedPurchases = [Major_Basket]
 *     and sourceCard = CARD_ID (so the candidate listener can scope the
 *     fixed-price candidate via context.actionCardId).
 *   - computeCosts listener on improvement-any keyed off context.actionCardId
 *     === CARD_ID and context.cardId === Major_Basket → appends a sourced
 *     fixed-price candidate { stone: 1, reed: 1 } while keeping the original.
 */

const onBuyListener: CardListenerRegistration = {
  id: 'C95-basket-weaver-onbuy',
  cardIds: [CARD_ID],
  actions: ['occupation'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.choice !== CARD_ID) return
    if (!isMajorImprovementAvailable(context.state, TARGET_MAJOR)) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'improvement',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { trueAction: false },
        params: {
          allowedPurchases: [TARGET_MAJOR],
        },
      },
      sourceCard: CARD_ID,
    }
  },
}

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
  listeners: [onBuyListener, computeCostsListener],
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
