import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B156_StorehouseKeeper } from '../../cards-display/B/B156_StorehouseKeeper'

const CARD_ID = B156_StorehouseKeeper.id

const RESOURCE_MARKET_SPACES = new Set([
  'resource-market',
  'resource-market-4',
])

/**
 * B156 Storehouse Keeper — Each time you use the Resource Market action space,
 * you also get your choice of 1 CLAY or 1 GRAIN.
 *
 * BGA (B156_StorehouseKeeper.php): isActionCardEvent('ResourceMarket') →
 * returns a NODE_XOR of gainNode([CLAY => 1]) / gainNode([GRAIN => 1]).
 */
const listener: CardListenerRegistration = {
  id: 'B156-storehouse-keeper-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!spaceId || !RESOURCE_MARKET_SPACES.has(spaceId)) return
    return {
      flow: {
        type: 'xor',
        children: [
          gainLeaf(CARD_ID, { clay: 1 }),
          gainLeaf(CARD_ID, { grain: 1 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const B156_StorehouseKeeper_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
