import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C141_SheepProvider } from '../../cards-display/C/C141_SheepProvider'

const CARD_ID = C141_SheepProvider.id

const listener: CardListenerRegistration = {
  id: 'C141-sheep-provider-any-sheep-market',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'sheep-market') return
    return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
  },
}

export const C141_SheepProvider_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
