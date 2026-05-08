import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C68_Bookcase } from '../../cards-display/C/C68_Bookcase'
export { C68_Bookcase }

const CARD_ID = C68_Bookcase.id

const listener: CardListenerRegistration = {
  id: 'C68-bookcase-after-occupation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { vegetable: 1 }), sourceCard: CARD_ID }
  },
}

export const C68_Bookcase_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
