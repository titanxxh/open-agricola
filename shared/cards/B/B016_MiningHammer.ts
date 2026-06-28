import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B016_MiningHammer'
/**
 * B16 Mining Hammer:
 * - onBuy: immediately get 1 food.
 * - After renovation: can build 1 stable without paying wood.
 *
 * BGA: onBuy → gain 1 food.
 *       afterRenovation → optional stables action (max 1, free cost).
 */

const afterRenovateListener: CardListenerRegistration = {
  id: 'B16-mining-hammer-after-renovate',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return {
      flow: {
        type: 'leaf',
        actionId: 'stables',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { max: 1, exactCost: { max: 1 } },
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [afterRenovateListener],
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { food: 1 }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B016_MiningHammer = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Mining Hammer',
    deck: 'B',
    number: 16,
    category: 'FARM_PLANNER',
    desc: [
        'When you play this card, you immediately get 1 <FOOD>. Each time you renovate, you can also build a stable without paying <WOOD>.',
      ],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const B016_MiningHammer_impl = B016_MiningHammer.impl
