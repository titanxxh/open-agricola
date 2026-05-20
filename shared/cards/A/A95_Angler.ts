import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { A95_Angler } from '../../cards-display/A/A95_Angler'
import { sumResourceMovedFromActionSpace } from '../helpers/event-provenance'

const CARD_ID = A95_Angler.id

const listener: CardListenerRegistration = {
  id: 'A95-angler-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'fishing') return
    const foodGained = sumResourceMovedFromActionSpace(
      context.actionEvents ?? context.transactionEvents,
      'food',
      (event) =>
        event.from.kind === 'actionSpace' &&
        event.from.spaceId === 'fishing' &&
        event.to.kind === 'player' &&
        event.to.playerId === context.player.id,
    )
    if (foodGained > 2) return
    if (foodGained <= 0) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'improvement',
        optional: true,
        sourceCard: CARD_ID,
      },
      sourceCard: CARD_ID,
    }
  },
}

export const A95_Angler_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
