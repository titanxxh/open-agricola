import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { canStartFencing } from '../../actions/effects/fencing'
import { gainLeaf } from '../helpers/pay-gain-node'
import { workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'

const CARD_ID = 'B94_StockProtector'

const beforeListener: CardListenerRegistration = {
  id: 'B94-stock-protector-before-fencing',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['fence'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { wood: 2 }), sourceCard: CARD_ID }
  },
}

const afterListener: CardListenerRegistration = {
  id: 'B94-stock-protector-after-fencing',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['fence'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (workersAvailable(context.state, context.player) <= 0) return
    return {
      flow: { type: 'leaf', actionId: 'place-farmer', optional: true, promptKey: 'ui.interactionStockProtectorPlace' },
      logKey: 'log.cardGrantedAction',
      logParams: { cardId: CARD_ID, actionId: 'place-farmer' },
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
    const previewPlayer = {
      ...context.player,
      resources: {
        ...context.player.resources,
        wood: (context.player.resources.wood ?? 0) + 2,
      },
    }
    if (!canStartFencing(context.state, previewPlayer)) return
    return { doable: true }
  },
}

export const B94_StockProtector = new Occupation({
  id: CARD_ID,
  name: "Stock Protector",
  deck: "B",
  number: 94,
  category: "ACTIONS_BOOSTER",
  desc: ["Each time before you use the __Fencing__ action space, you get 2 <WOOD>. Immediately after that __Fencing__ action, you can place another person."],
  cost: {},
  players: "1+",
  newSet: true,
})

export const B94_StockProtector_impl = {
  listeners: [beforeListener, afterListener, isDoableListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
