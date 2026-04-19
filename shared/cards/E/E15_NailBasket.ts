import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'E15_NailBasket'

// E15 Nail Basket: Each time after you use a wood accumulation space, you can place 1 STONE
// from your supply on that space (for the next visitor) to take a Build Fences action.
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

registerCardListener(listener)

export const E15_NailBasket = new MinorImprovement({
  id: CARD_ID,
  name: 'Nail Basket',
  deck: 'E',
  number: 15,
  category: 'FARMYARD_FENCING_OR_STABLE_BUILDING',
  desc: [
    'Each time after you use a wood accumulation space, you can place 1\u00a0<STONE> from your supply on that space (for the next visitor) to take a __Build Fences__ action.',
  ],
  cost: { reed: 1 },
  vp: 1,
})
