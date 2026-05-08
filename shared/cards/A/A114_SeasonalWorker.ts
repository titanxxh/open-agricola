import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A114_SeasonalWorker } from '../../cards-display/A/A114_SeasonalWorker'
export { A114_SeasonalWorker }

const CARD_ID = A114_SeasonalWorker.id

const listener: CardListenerRegistration = {
  id: 'A114-seasonal-worker-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || context.space.id !== 'day-laborer') return
    if (context.state.round < 6) {
      return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
    }
    return {
      flow: {
        type: 'xor',
        children: [
          gainLeaf(CARD_ID, { grain: 1 }),
          gainLeaf(CARD_ID, { vegetable: 1 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const A114_SeasonalWorker_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
