import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'D016_WoodenWheyBucket'
const listener: CardListenerRegistration = {
  id: 'D16-wooden-whey-bucket-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (spaceId !== 'sheep-market' && spaceId !== 'cattle-market') return
    const isCattleMarket = spaceId === 'cattle-market'
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'stables',
            sourceCard: CARD_ID,
            actionContext: isCattleMarket
              ? { max: 1, exactCost: { max: 1 } }
              : { max: 1, exactCost: { wood: 1, max: 1 } },
          },
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

export const D016_WoodenWheyBucket = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Wooden Whey Bucket',
    deck: 'D',
    number: 16,
    category: 'FARM_PLANNER',
    desc: ['Each time before you use the __Sheep Market__/__Cattle Market__ accumulation space, you can build exactly 1 stable for 1 <WOOD>/at no cost.'],
    cost: { wood: 1, food: 1 },
  },
  impl: cardImpl,
})

export const D016_WoodenWheyBucket_impl = D016_WoodenWheyBucket.impl
