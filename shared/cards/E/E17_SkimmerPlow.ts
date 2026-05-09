import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { E17_SkimmerPlow } from '../../cards-display/E/E17_SkimmerPlow'

const CARD_ID = E17_SkimmerPlow.id

const listener: CardListenerRegistration = {
  id: 'E17-skimmer-plow-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (spaceId !== 'farmland' && spaceId !== 'cultivation') return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const E17_SkimmerPlow_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
