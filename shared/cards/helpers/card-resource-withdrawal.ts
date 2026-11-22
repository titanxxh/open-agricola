import type { Resource } from '../../contract/types'
import type { CardListenerRegistration } from '../card-listeners'

/** A repeatable anytime withdrawal. Leaving stock on the card preserves its future effects. */
export const cardResourceWithdrawal = (
  cardId: string,
  resource: keyof Resource,
): CardListenerRegistration => ({
  id: cardId + '-withdraw-' + resource,
  cardIds: [cardId],
  actions: ['anytime'],
  phases: ['anytime'],
  handler: ({ player }) => {
    const amount = player.cardStates[cardId]?.counters?.[resource] ?? 0
    if (amount <= 0) return
    return {
      sourceCard: cardId,
      labelKey: `cards.${cardId}.name`,
      flow: {
        type: 'xor',
        children: Array.from({ length: amount }, (_, i) => ({
          type: 'leaf',
          actionId: 'take-from-card',
          sourceCard: cardId,
          params: { [resource]: i + 1 },
        })),
      },
    }
  },
})
