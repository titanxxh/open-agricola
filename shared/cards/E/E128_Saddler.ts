import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payThenActionFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E128_Saddler'

// 7b1 migration: listens on `actions: ['pay']` with costType=major-improvement.
const listener: CardListenerRegistration = {
  id: 'E128-saddler-after-pay',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['pay'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const ctx = context as unknown as { costType?: string }
    if (ctx.costType !== 'major-improvement') return
    return {
      ...payThenActionFlow({
        cardId: CARD_ID,
        cost: { food: 1 },
        promptKey: 'ui.interactionSaddlerPlow',
        action: { type: 'leaf', actionId: 'plow' },
      }),
      logKey: 'log.cardGrantedAction',
      logParams: { cardId: CARD_ID, actionId: 'plow' },
      sourceCard: CARD_ID,
    }
  },
}

export const E128_Saddler = new Occupation({
  id: CARD_ID,
  name: "Saddler",
  deck: "E",
  number: 128,
  category: "FARMYARD",
  desc: ["Each time after you build a major improvement, you can pay 1 <FOOD> to plow 1 field."],
  cost: {},
  players: "3+",
})

export const E128_Saddler_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
