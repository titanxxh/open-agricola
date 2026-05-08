import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B16_MiningHammer } from '../../cards-display/B/B16_MiningHammer'
export { B16_MiningHammer }

const CARD_ID = B16_MiningHammer.id

/**
 * B16 Mining Hammer:
 * - onBuy: immediately get 1 food.
 * - After renovation: can build 1 stable without paying wood.
 *
 * BGA: onBuy → gain 1 food.
 *       afterRenovation → optional stables action (max 1, free cost).
 */

const onBuyListener: CardListenerRegistration = {
  id: 'B16-mining-hammer-onbuy',
  cardIds: [CARD_ID],
  actions: ['play-improvement'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.choice !== `minor:${CARD_ID}` && context.choice !== CARD_ID) return
    return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
  },
}

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
        actionContext: { max: 1, costOverride: {} },
      },
      sourceCard: CARD_ID,
    }
  },
}

export const B16_MiningHammer_impl = {
  listeners: [onBuyListener, afterRenovateListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
