import type { CardListenerRegistration } from '../card-listeners'
import { incCounter, initCardState } from './helpers'

const CARD_ID = 'Stub_CardStorage_ConsumeFence'

export const computeCostsListener: CardListenerRegistration = {
  id: 'stub-card-storage-costs-fence',
  cardIds: [CARD_ID],
  phases: ['computeCosts'],
  actions: ['fence'],
  handler: (context) => {
    const counters = initCardState(context.player, CARD_ID)
    const stored = counters['fences'] ?? 0
    if (stored <= 0) return
    counters['fences'] = stored - 1
    incCounter(context.player, CARD_ID, 'observedCount')
    return { costs: { wood: -1 } }
  },
}
