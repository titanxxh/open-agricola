import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'D26_CarpentersYard'

// D26 Carpenter's Yard: Build Joinery and Well major improvements even when taking a
// Minor Improvement action, or build both with a single Major Improvement action.
// BGA: immediatelyAfterImprovement -> if played Joinery or Well, offer to build the other.

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
            } as any,
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(afterImprovementListener)

export const D26_CarpentersYard = new MinorImprovement({
  id: CARD_ID,
  name: "Carpenter's Yard",
  deck: 'D',
  number: 26,
  category: 'ACTIONS_BOOSTER',
  desc: ['You can build the __Joinery__ and __Well__ major improvement even when taking a __Minor Improvement__ action, or you can build both with a single __Major Improvement__ action.'],
  cost: { wood: 1, reed: 1 },
  vp: 1,
  evenMoreSet: true,
})
