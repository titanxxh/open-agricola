import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { D26_CarpentersYard } from '../../cards-display/D/D26_CarpentersYard'
export { D26_CarpentersYard }

const CARD_ID = D26_CarpentersYard.id

const ALLOWED_CARDS = ['Major_Well', 'Major_Joinery']

const afterImprovementListener: CardListenerRegistration = {
  id: 'D26-carpenters-yard-immediately-after-improvement',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['improvement-any', 'minor-improvement'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.trueAction === false) return
    const playedCardId = context.cardId
    if (!playedCardId || !ALLOWED_CARDS.includes(playedCardId)) return

    const otherCard = playedCardId === 'Major_Well' ? 'Major_Joinery' : 'Major_Well'
    if (!context.state.availableMajorImprovements.includes(otherCard)) return

    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'improvement-any',
            sourceCard: CARD_ID,
            actionContext: { trueAction: false },
            params: {
              allowedPurchases: [otherCard],
            },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const D26_CarpentersYard_impl = {
  listeners: [afterImprovementListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
