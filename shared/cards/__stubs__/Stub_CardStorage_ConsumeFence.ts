import type { CardListenerRegistration } from '../card-listeners'
import { observe } from './helpers'

const CARD_ID = 'Stub_CardStorage_ConsumeFence'

const storedFences = (player: Parameters<typeof observe>[0] & { cardStates?: Record<string, { counters?: Record<string, number> }> }) =>
  player.cardStates?.[CARD_ID]?.counters?.fences ?? 0

/**
 * Card-storage pattern under listener purity: the cost query only reads the
 * stored token count, and the consumption is a returned `special-effect` leaf
 * that executes after the fence action instead of a write inside the query.
 */
export const computeCostsListener: CardListenerRegistration = {
  id: 'stub-card-storage-costs-fence',
  cardIds: [CARD_ID],
  phases: ['computeCosts'],
  actions: ['fence'],
  handler: (context) => {
    if (storedFences(context.player) <= 0) return
    observe(context.player, CARD_ID)
    return { costs: { wood: -1 } }
  },
}

export const consumeListener: CardListenerRegistration = {
  id: 'stub-card-storage-consume-fence',
  cardIds: [CARD_ID],
  phases: ['after'],
  actions: ['fence'],
  handler: (context) => {
    const stored = storedFences(context.player)
    if (stored <= 0) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'set-counter', key: 'fences', value: stored - 1 },
      },
      sourceCard: CARD_ID,
      countCardUse: false,
    }
  },
}
