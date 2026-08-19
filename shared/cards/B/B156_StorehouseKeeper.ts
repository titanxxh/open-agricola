import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B156_StorehouseKeeper'
const RESOURCE_MARKET_SPACES = new Set([
  'resource-market',
  'resource-market-4',
])

/**
 * B156 Storehouse Keeper — Each time you use the Resource Market action space,
 * you also get your choice of 1 CLAY or 1 GRAIN.
 *
 * Rule: isActionCardEvent('ResourceMarket') →
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

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B156_StorehouseKeeper = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Storehouse Keeper',
    deck: 'B',
    number: 156,
    category: 'GOODS_PROVIDER',
    desc: [
        'Each time you use the __Resource Market__ action space, you also get your choice of 1 <CLAY> or 1 <GRAIN>.',
      ],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const B156_StorehouseKeeper_impl = B156_StorehouseKeeper.impl
