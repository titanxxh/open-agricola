import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'D026_CarpentersYard'
const ALLOWED_CARDS = ['Major_Well', 'Major_Joinery']

const afterImprovementListener: CardListenerRegistration = {
  id: 'D26-carpenters-yard-immediately-after-improvement',
  cardIds: [CARD_ID],
  phases: ['immediatelyAfter' as ActionHookPhase],
  actions: ['improvement'],
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
            actionId: 'improvement',
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

const cardImpl = {
  listeners: [afterImprovementListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D026_CarpentersYard = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Carpenter's Yard",
    deck: 'D',
    number: 26,
    category: 'ACTIONS_BOOSTER',
    desc: ['You can build the __Joinery__ and __Well__ major improvement even when taking a __Minor Improvement__ action, or you can build both with a single __Major Improvement__ action.'],
    cost: { wood: 1, reed: 1 },
    vp: 1,
    evenMoreSet: true,
  },
  impl: cardImpl,
})

export const D026_CarpentersYard_impl = D026_CarpentersYard.impl
