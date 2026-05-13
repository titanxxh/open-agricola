import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getCardStack, pushToCardStack } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { Resource } from '../../contract/types'
import type { CardImpl } from '../registry'
import { E103_Wolf } from '../../cards-display/E/E103_Wolf'

const CARD_ID = E103_Wolf.id

/**
 * After gain/collect: if the gained resources include the top-of-stack resource,
 * pop the top item from the stack and gain 1 pig.
 * This is optional (XOR with skip).
 */
const afterGainCollectListener: CardListenerRegistration = {
  id: 'E103-wolf-after-gain-collect',
  cardIds: [CARD_ID],
  actions: ['gain', 'collect'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const stack = getCardStack(context.player, CARD_ID)
    if (stack.length === 0) return
    const top = stack[stack.length - 1] as keyof Resource
    const gained =
      context.result?.type === 'ok' ? context.result.resourcesGained : undefined
    if (!gained || (gained[top] ?? 0) <= 0) return
    return {
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'pop-card-stack-top' },
          },
          gainLeaf(CARD_ID, { boar: 1 }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const E103_Wolf_impl = {
  listeners: [afterGainCollectListener],
  effect: {
  id: CARD_ID,
  onBuy: (_state, player) => {
    pushToCardStack(player, CARD_ID, ['clay', 'wood', 'grain'])
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
