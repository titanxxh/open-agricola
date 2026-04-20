import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'C95_BasketWeaver'
const TARGET_MAJOR = 'Major_Basket'

/**
 * C95 Basket Weaver (Occupation, 1+ players).
 *
 * BGA (C95_BasketWeaver.php): When you play this card, immediately build the
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
 *   - play-occupation after-listener triggered when this card is played →
 *     offer optional improvement-any with allowedPurchases = [Major_Basket]
 *     and sourceCard = CARD_ID (so computeCosts listener can scope the
 *     discount via context.actionCardId).
 *   - computeCosts listener on improvement-any keyed off context.actionCardId
 *     === CARD_ID and context.cardId === Major_Basket → applies delta so the
 *     effective cost becomes { stone: 1, reed: 1 } (base is 2 reed + 2 stone,
 *     so delta = { stone: -1, reed: -1 }).
 */

const onBuyListener: CardListenerRegistration = {
  id: 'C95-basket-weaver-onbuy',
  cardIds: [CARD_ID],
  actions: ['play-occupation'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.choice !== CARD_ID) return
    if (!context.state.availableMajorImprovements.includes(TARGET_MAJOR)) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'improvement-any',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { trueAction: false },
        params: {
          allowedPurchases: [TARGET_MAJOR],
        } as any,
      },
      sourceCard: CARD_ID,
    }
  },
}

const computeCostsListener: CardListenerRegistration = {
  id: 'C95-basket-weaver-compute-costs',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.actionCardId !== CARD_ID) return
    if (context.cardId !== TARGET_MAJOR) return
    // Base cost is { reed: 2, stone: 2 } → reduce to { reed: 1, stone: 1 }.
    return { costs: { stone: -1, reed: -1 } }
  },
}

export const C95_BasketWeaver = new Occupation({
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
  newSet: true,
})

export const C95_BasketWeaver_impl = {
  listeners: [onBuyListener, computeCostsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
