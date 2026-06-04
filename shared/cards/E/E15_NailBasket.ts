import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'E15_NailBasket'
const listener: CardListenerRegistration = {
  id: 'E15-nail-basket-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const gainPerRound = context.space?.gainPerRound ?? {}
    if ((gainPerRound.wood ?? 0) <= 0) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'return-to-space',
            params: { stone: 1 },
            sourceCard: CARD_ID,
          },
          {
            type: 'leaf',
            actionId: 'fence',
            sourceCard: CARD_ID,
            actionContext: { trueAction: false },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E15_NailBasket = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Nail Basket',
    deck: 'E',
    number: 15,
    category: 'FARMYARD_-__FENCING_OR_STABLE_BUILDING',
    desc: [
        'Each time after you use a wood accumulation space, you can place 1\u00a0<STONE> from your supply on that space (for the next visitor) to take a __Build Fences__ action.',
      ],
    cost: { reed: 1 },
    vp: 1,
  },
  impl: cardImpl,
})

export const E15_NailBasket_impl = E15_NailBasket.impl
