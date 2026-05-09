import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { B92_LittleStickKnitter } from '../../cards-display/B/B92_LittleStickKnitter'

const CARD_ID = B92_LittleStickKnitter.id

const listener: CardListenerRegistration = {
  id: 'B92-little-stick-knitter-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'sheep-market') return
    if (context.state.round < 5) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'wish-children',
        optional: true,
        sourceCard: CARD_ID,
        // Family growth with free room only (no extra room needed)
        actionContext: { constraints: ['freeRoom'], trueAction: false },
      },
      sourceCard: CARD_ID,
    }
  },
}

export const B92_LittleStickKnitter_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
