import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { D139_Chairman } from '../../cards-display/D/D139_Chairman'
export { D139_Chairman }

const CARD_ID = D139_Chairman.id

const opponentListener: CardListenerRegistration = {
  id: 'D139-chairman-opponent-meeting-place',
  cardIds: [CARD_ID],
  actions: ['meeting-place'],
  phases: ['before' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'meeting-place') return
    const ownerId = context.ownerPlayer?.id
    if (!ownerId) return
    return {
      flow: {
        type: 'seq',
        children: [
          // Give food to the opponent (acting player) — runs under acting player context
          gainLeaf(CARD_ID, { food: 1 }),
          // Give food to the card owner via targeted gain
          {
            type: 'leaf',
            actionId: 'gain',
            params: { food: 1, recipientPlayerId: ownerId },
            sourceCard: CARD_ID,
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const playerListener: CardListenerRegistration = {
  id: 'D139-chairman-player-meeting-place',
  cardIds: [CARD_ID],
  actions: ['meeting-place'],
  phases: ['before' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'meeting-place') return
    return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
  },
}

export const D139_Chairman_impl = {
  listeners: [opponentListener, playerListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
