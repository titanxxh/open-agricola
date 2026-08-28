import { defineMinorCard } from '../card-source'
import type { Resource, TradeModifier } from '../../contract/types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getStableTilesBuiltThisAction } from '../helpers/action-snapshot'
import { getStableCountForCards } from '../../domain/stables'
import type { CardImpl } from '../registry'

const CARD_ID = 'C056_FeedFence'
const NON_WOOD_COST_MAX: Partial<Resource> = {
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  horse: 0,
  fuel: 0,
  begging: 0,
}
const afterListener: CardListenerRegistration = {
  id: 'C56-feed-fence-after-stables',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['stables'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const built = getStableTilesBuiltThisAction(context.player)
    if (built <= 0) return
    // +2 bonus for 4th stable (when player now has exactly 4 stables)
    const bonusFood = getStableCountForCards(context.player) === 4 ? 2 : 0
    const totalFood = built + bonusFood
    return { flow: gainLeaf(CARD_ID, { food: totalFood }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [afterListener],
  modifiers: [{
    type: 'trade',
    cardId: CARD_ID,
    appliesTo: ['stables'],
    from: { clay: 1 },
    to: { wood: 2 },
    scope: 'unit',
    max: 1,
    groupId: CARD_ID,
    groupMax: 1,
    replaceUpTo: true,
    minCost: { wood: 1 },
    maxCost: NON_WOOD_COST_MAX,
  } as TradeModifier],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C056_FeedFence = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Feed Fence',
    deck: 'C',
    number: 56,
    category: 'FOOD_PROVIDER',
    desc: [
        'For each new <STABLE> you build, you get 1 <FOOD> —for your last one, get 3 <FOOD>. Each time you build <STABLE>, you can build exactly 1 <STABLE> for 1 <CLAY> instead of <WOOD>.',
      ],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const C056_FeedFence_impl = C056_FeedFence.impl
