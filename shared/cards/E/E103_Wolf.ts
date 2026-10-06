import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getCardStack, pushToCardStack } from '../helpers/card-state'
import { hasResourceMovedToPlayer } from '../helpers/event-provenance'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow, PlayerState, Resource } from '../../contract/types'
import type { DraftGameEvent, ResourceExchangedEvent } from '../../contract/events'
import type { CardImpl } from '../registry'

const CARD_ID = 'E103_Wolf'
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

const buildClaimFlow = (
  player: PlayerState,
  matches: (resource: keyof Resource) => boolean,
): ActionFlow | undefined => {
  let count = 0
  for (const item of [...getCardStack(player, CARD_ID)].reverse()) {
    if (!matches(item as keyof Resource)) break
    count += 1
  }
  if (count === 0) return
  return {
    type: 'xor', optional: true, promptKey: 'ui.interactionFlowSelect',
    children: Array.from({ length: count }, (_, index) => ({
      type: 'seq', choiceLabelKey: 'ui.interactionWolfTakeCount', choiceLabelParams: { count: index + 1 },
      children: [
        ...Array.from({ length: index + 1 }, () => ({
          type: 'leaf' as const, actionId: 'pop-card-stack', sourceCard: CARD_ID,
        })),
        gainLeaf(CARD_ID, { boar: index + 1 }),
      ],
    })),
  }
}

const afterGainCollectListener: CardListenerRegistration = {
  id: 'E103-wolf-after-gain-collect',
  cardIds: [CARD_ID],
  actions: ['gain', 'collect', 'exchange', 'receive', 'reap', 'take-from-card', 'pop-card-stack'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.sourceCard === CARD_ID) return
    const events = context.actionEvents ?? context.transactionEvents
    const flow = buildClaimFlow(context.player, (resource) =>
      hasResourceMovedToPlayer(events, resource, context.player.id) || hasResourceExchangedToPlayer(context, resource))
    if (flow) return { flow, sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [afterGainCollectListener],
  effect: {
  id: CARD_ID,
  onAfterReap: (state, player) => buildClaimFlow(player, (resource) =>
    (state.harvestReapSummary?.[player.id]?.resources[resource] ?? 0) > 0),
  onBuy: (_state, player) => {
    pushToCardStack(player, CARD_ID, ['clay', 'wood', 'grain'])
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E103_Wolf = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Wolf',
    deck: 'E',
    number: 103,
    desc: [
        'Pile (from bottom to top) 1 <CLAY>, 1 <WOOD>, and 1 <GRAIN> on this card. Each time you get a good matching the top item, you can move that item to your supply and get 1 <PIG>.',
      ],
    cost: {},
    players: '1+',
    category: 'GOODS_-_GET',
  },
  presentation: { stack: true },
  impl: cardImpl,
})

export const E103_Wolf_impl = E103_Wolf.impl
