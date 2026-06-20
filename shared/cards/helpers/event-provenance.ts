import type { Resource } from '../../contract/types'
import type { DraftGameEvent, ResourceExchangedEvent, ResourceMovedEvent, ResourcePaidEvent } from '../../contract/events'
import type { QueryableGameEvent } from '../../events/query'
import type { CardListenerContext } from '../card-listeners'

type QueryableResourceExchangedEvent = ResourceExchangedEvent | DraftGameEvent<'resource.exchanged'>
type QueryableResourceMovedEvent = ResourceMovedEvent | DraftGameEvent<'resource.moved'>
type QueryableResourcePaidEvent = ResourcePaidEvent | DraftGameEvent<'resource.paid'>

const isResourceExchangedEvent = (event: QueryableGameEvent): event is QueryableResourceExchangedEvent =>
  event.type === 'resource.exchanged'

const isResourceMovedEvent = (event: QueryableGameEvent): event is QueryableResourceMovedEvent =>
  event.type === 'resource.moved'

const isResourcePaidEvent = (event: QueryableGameEvent): event is QueryableResourcePaidEvent =>
  event.type === 'resource.paid'

export const hasExchangeGained = (
  events: readonly QueryableGameEvent[] | undefined,
  resource: keyof Resource,
  predicate: (event: QueryableResourceExchangedEvent) => boolean = () => true,
): boolean =>
  (events ?? []).some((event) =>
    isResourceExchangedEvent(event) &&
    (event.gained[resource] ?? 0) > 0 &&
    predicate(event),
  )

export const hasResourceMovedToPlayer = (
  events: readonly QueryableGameEvent[] | undefined,
  resource: keyof Resource,
  playerId: string,
): boolean =>
  (events ?? []).some((event) =>
    isResourceMovedEvent(event) &&
    (event.resources[resource] ?? 0) > 0 &&
    event.to.kind === 'player' &&
    event.to.playerId === playerId,
  )

export const hasResourceMovedFromActionSpace = (
  events: readonly QueryableGameEvent[] | undefined,
  resource: keyof Resource,
  predicate: (event: QueryableResourceMovedEvent) => boolean = () => true,
): boolean =>
  (events ?? []).some((event) =>
    isResourceMovedEvent(event) &&
    event.from.kind === 'actionSpace' &&
    (event.resources[resource] ?? 0) > 0 &&
    predicate(event),
  )

export const sumResourceMovedToPlayer = (
  events: readonly QueryableGameEvent[] | undefined,
  resource: keyof Resource,
  playerId: string,
  predicate: (event: QueryableResourceMovedEvent) => boolean = () => true,
): number =>
  (events ?? []).reduce((total, event) => {
    if (!isResourceMovedEvent(event)) return total
    const amount = event.resources[resource] ?? 0
    if (amount <= 0 || event.to.kind !== 'player' || event.to.playerId !== playerId || !predicate(event)) return total
    return total + amount
  }, 0)

export const sumResourceMovedFromActionSpace = (
  events: readonly QueryableGameEvent[] | undefined,
  resource: keyof Resource,
  predicate: (event: QueryableResourceMovedEvent) => boolean = () => true,
): number =>
  (events ?? []).reduce((total, event) => {
    if (!isResourceMovedEvent(event)) return total
    const amount = event.resources[resource] ?? 0
    if (amount <= 0 || event.from.kind !== 'actionSpace' || !predicate(event)) return total
    return total + amount
  }, 0)

export const sumActionSpaceMovedToPlayer = (
  events: readonly QueryableGameEvent[] | undefined,
  resource: keyof Resource,
  playerId: string,
): number =>
  sumResourceMovedToPlayer(events, resource, playerId, (event) =>
    event.from.kind === 'actionSpace',
  )

export const sumActionSpaceMovedToTriggerPlayer = (
  context: CardListenerContext,
  resource: keyof Resource,
): number =>
  sumActionSpaceMovedToPlayer(
    context.actionEvents ?? context.transactionEvents,
    resource,
    (context.triggerPlayer ?? context.player).id,
  )

export const sumActionSpaceMovedToTriggerPlayerFromSpace = (
  context: CardListenerContext,
  resource: keyof Resource,
  spaceId: string | undefined = context.space?.id,
): number =>
  sumResourceMovedToPlayer(
    context.actionEvents ?? context.transactionEvents,
    resource,
    (context.triggerPlayer ?? context.player).id,
    (event) => event.from.kind === 'actionSpace' && event.from.spaceId === spaceId,
  )

export const sumResourcePaid = (
  events: readonly QueryableGameEvent[] | undefined,
  resource: keyof Resource,
  predicate: (event: QueryableResourcePaidEvent) => boolean = () => true,
): number =>
  (events ?? []).reduce((total, event) => {
    if (!isResourcePaidEvent(event)) return total
    const amount = event.resources[resource] ?? 0
    if (amount <= 0 || !predicate(event)) return total
    return total + amount
  }, 0)
