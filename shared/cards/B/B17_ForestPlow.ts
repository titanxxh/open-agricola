import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { B17_ForestPlow } from '../../cards-display/B/B17_ForestPlow'

const CARD_ID = B17_ForestPlow.id

const isWoodAccumulationSpace = (space: CardListenerContext['space']): boolean =>
  (space?.gainPerRound?.wood ?? 0) > 0

const listener: CardListenerRegistration = {
  id: 'B17-forest-plow-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isWoodAccumulationSpace(context.space)) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'return-to-space',
            params: { wood: 2 },
            sourceCard: CARD_ID,
          },
          {
            type: 'leaf',
            actionId: 'plow',
            sourceCard: CARD_ID,
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const B17_ForestPlow_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
