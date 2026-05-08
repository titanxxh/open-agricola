import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A119_FirewoodCollector } from '../../cards-display/A/A119_FirewoodCollector'
export { A119_FirewoodCollector }

const CARD_ID = 'A119_FirewoodCollector'

const TRIGGER_SPACES = new Set(['farmland', 'grain-seeds', 'grain-utilization', 'cultivation'])

const listener: CardListenerRegistration = {
  id: 'A119-firewood-collector-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || !TRIGGER_SPACES.has(context.space.id)) return
    return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
  },
}

export const A119_FirewoodCollector_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
