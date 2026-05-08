import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { workersAvailable } from '../../domain/player'
import type { CardImpl } from '../registry'
import { E131_MarketMaster } from '../../cards-display/E/E131_MarketMaster'
export { E131_MarketMaster }

const CARD_ID = E131_MarketMaster.id

const listener: CardListenerRegistration = {
  id: 'E131-market-master-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'traveling-players') return
    // Only triggers when placing the last person
    if (workersAvailable(context.state, context.player) > 0) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'play-occupation',
        optional: true,
        sourceCard: CARD_ID,
        params: { costOverride: { food: 1 } },
      },
      sourceCard: CARD_ID,
    }
  },
}

export const E131_MarketMaster_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
