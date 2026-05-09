import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D49_Bookshelf } from '../../cards-display/D/D49_Bookshelf'

const CARD_ID = D49_Bookshelf.id

const beforeListener: CardListenerRegistration = {
  id: 'D49-bookshelf-before-occupation',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { food: 3 }), sourceCard: CARD_ID }
  },
}

const isDoableListener: CardListenerRegistration = {
  id: 'D49-bookshelf-isdoable-occupation',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { doable: true }
  },
}

export const D49_Bookshelf_impl = {
  listeners: [beforeListener, isDoableListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
