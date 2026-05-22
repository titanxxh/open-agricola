import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B75_WoodWorkshop } from '../../cards-display/B/B75_WoodWorkshop'

const CARD_ID = B75_WoodWorkshop.id

const beforeListener: CardListenerRegistration = {
  id: 'B75-wood-workshop-before-improvement',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['improvement'],
  dispatchMode: 'select',
  mandatory: true,
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'B75-wood-workshop-isdoable-improvement',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.doable) return
    if (context.actionContext?.skipBeforeTriggers === true) return
    return { doable: true }
  },
}

export const B75_WoodWorkshop_impl = {
  listeners: [beforeListener, isDoableListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
