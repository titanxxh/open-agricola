import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { D19_PulverizerPlow } from '../../cards-display/D/D19_PulverizerPlow'
export { D19_PulverizerPlow }

const CARD_ID = D19_PulverizerPlow.id

const listener: CardListenerRegistration = {
  id: 'D19-pulverizer-plow-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const gainPerRound = context.space?.gainPerRound ?? {}
    if ((gainPerRound.clay ?? 0) <= 0) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'return-to-space',
            params: { clay: 1 },
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

export const D19_PulverizerPlow_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
