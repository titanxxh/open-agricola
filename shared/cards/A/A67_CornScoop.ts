import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A67_CornScoop } from '../../cards-display/A/A67_CornScoop'

const CARD_ID = A67_CornScoop.id

const listener: CardListenerRegistration = {
  id: 'A67-corn-scoop-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || context.space.id !== 'grain-seeds') return
    return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
  },
}

export const A67_CornScoop_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
