import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getCardStack, pushToCardStack } from '../helpers/card-state'
import { hasResourceMovedToPlayer } from '../helpers/event-provenance'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { Resource } from '../../contract/types'
import type { DraftGameEvent, ResourceExchangedEvent } from '../../contract/events'
import type { CardImpl } from '../registry'
import { E103_Wolf } from '../../cards-display/E/E103_Wolf'

const CARD_ID = E103_Wolf.id

type QueryableResourceExchangedEvent = ResourceExchangedEvent | DraftGameEvent<'resource.exchanged'>

const isResourceExchangedEvent = (
  event: CardListenerContext['transactionEvents'][number],
): event is QueryableResourceExchangedEvent =>
  event.type === 'resource.exchanged'

const hasResourceExchangedToPlayer = (
  context: CardListenerContext,
  resource: keyof Resource,
): boolean => {
  const events = context.actionEvents ?? context.transactionEvents
  return (events ?? []).some((event) =>
    isResourceExchangedEvent(event) &&
    (event.gained[resource] ?? 0) > 0 &&
    event.gainedTo.kind === 'player' &&
    event.gainedTo.playerId === context.player.id,
  )
}

/**
 * After gain/collect/exchange: if the gained resources include the top-of-stack resource,
 * pop the top item from the stack and gain 1 pig.
 * This is optional (XOR with skip).
 */
const afterGainCollectListener: CardListenerRegistration = {
  id: 'E103-wolf-after-gain-collect',
  cardIds: [CARD_ID],
  actions: ['gain', 'collect', 'exchange'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const stack = getCardStack(context.player, CARD_ID)
    if (stack.length === 0) return
    const top = stack[stack.length - 1] as keyof Resource
    const events = context.actionEvents ?? context.transactionEvents
    const gained = hasResourceMovedToPlayer(events, top, context.player.id) ||
      hasResourceExchangedToPlayer(context, top)
    if (!gained) return
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
