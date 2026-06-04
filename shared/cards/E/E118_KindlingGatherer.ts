import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { DraftGameEvent, ResourceMovedEvent } from '../../contract/events'
import { sumResourceMovedToPlayer } from '../helpers/event-provenance'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E118_KindlingGatherer'
type QueryableResourceMovedEvent = ResourceMovedEvent | DraftGameEvent<'resource.moved'>

const isFoodFromActionSpace = (
  context: CardListenerContext,
  event: QueryableResourceMovedEvent,
) =>
  event.from.kind === 'actionSpace' ||
  (
    context.actionId === 'gain' &&
    event.from.kind === 'supply' &&
    event.reason === 'gain' &&
    !event.sourceCardId &&
    Boolean(context.space?.id)
  )

const hasActionSpaceFoodMovedToTriggerPlayer = (context: CardListenerContext) =>
  sumResourceMovedToPlayer(
    context.actionEvents ?? context.transactionEvents,
    'food',
    (context.triggerPlayer ?? context.player).id,
    (event) => isFoodFromActionSpace(context, event),
  ) > 0

const placeFarmerListener: CardListenerRegistration = {
  id: 'E118-kindling-gatherer-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (hasActionSpaceFoodMovedToTriggerPlayer(context)) {
      return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
    }
  },
}

const collectListener: CardListenerRegistration = {
  id: 'E118-kindling-gatherer-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (hasActionSpaceFoodMovedToTriggerPlayer(context)) {
      return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
    }
  },
}

const gainListener: CardListenerRegistration = {
  id: 'E118-kindling-gatherer-after-gain',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['gain'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (hasActionSpaceFoodMovedToTriggerPlayer(context)) {
      return { flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }
    }
  },
}

const cardImpl = {
  listeners: [placeFarmerListener, collectListener, gainListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E118_KindlingGatherer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Kindling Gatherer',
    deck: 'E',
    number: 118,
    category: 'BUILDING_RESOURCES_-_WOOD',
    desc: ['Each time you get <FOOD> from an action space, you get 1 additional <WOOD>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const E118_KindlingGatherer_impl = E118_KindlingGatherer.impl
