import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C164_GermanHeathKeeper } from '../../cards-display/C/C164_GermanHeathKeeper'

const CARD_ID = C164_GermanHeathKeeper.id

const listener: CardListenerRegistration = {
  id: 'C164-german-heath-keeper-any-pig-market',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'pig-market') return
    return { flow: gainLeaf(CARD_ID, { sheep: 1 }), sourceCard: CARD_ID }
  },
}

export const C164_GermanHeathKeeper_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
