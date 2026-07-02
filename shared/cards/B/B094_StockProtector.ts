import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'B094_StockProtector'
const beforeListener: CardListenerRegistration = {
  id: 'B94-stock-protector-before-fencing',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['fence'],
  mandatory: true,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.trueAction === false) return
    return { flow: gainLeaf(CARD_ID, { wood: 2 }), sourceCard: CARD_ID }
  },
}

const afterListener: CardListenerRegistration = {
  id: 'B94-stock-protector-after-fencing',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.trueAction === false) return
    if (workersAvailable(context.state, context.player) <= 0) return
    return {
      flow: { type: 'leaf', actionId: 'place-farmer', optional: true, promptKey: 'ui.interactionStockProtectorPlace' },
      sourceCard: CARD_ID,
    }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'B94-stock-protector-isdoable-fencing',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.doable) return
    if (context.actionContext?.skipBeforeTriggers === true) return
    if (context.trueAction === false) return
    return { doable: true }
  },
}

const cardImpl = {
  listeners: [beforeListener, afterListener, isDoableListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B094_StockProtector = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Stock Protector",
    deck: "B",
    number: 94,
    category: "ACTIONS_BOOSTER",
    desc: ["Each time before you use the __Fencing__ action space, you get 2 <WOOD>. Immediately after that __Fencing__ action, you can place another person."],
    cost: {},
    players: "1+",
  },
  impl: cardImpl,
})

export const B094_StockProtector_impl = B094_StockProtector.impl
