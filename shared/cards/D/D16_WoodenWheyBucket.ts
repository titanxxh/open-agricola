import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { D16_WoodenWheyBucket } from '../../cards-display/D/D16_WoodenWheyBucket'

const CARD_ID = D16_WoodenWheyBucket.id

const listener: CardListenerRegistration = {
  id: 'D16-wooden-whey-bucket-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (spaceId !== 'sheep-market' && spaceId !== 'cattle-market') return
    // Sheep market: pay 1 wood; Cattle market: free
    const freeCost = spaceId === 'cattle-market'
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'stables',
            sourceCard: CARD_ID,
            params: freeCost ? { max: 1, freeCost: true } : { max: 1 },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const D16_WoodenWheyBucket_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
