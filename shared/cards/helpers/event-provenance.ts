import type { Resource } from '../../contract/types'
import type { DraftGameEvent, ResourceExchangedEvent, ResourceMovedEvent } from '../../contract/events'
import type { QueryableGameEvent } from '../../events/query'

type QueryableResourceExchangedEvent = ResourceExchangedEvent | DraftGameEvent<'resource.exchanged'>
type QueryableResourceMovedEvent = ResourceMovedEvent | DraftGameEvent<'resource.moved'>

const isResourceExchangedEvent = (event: QueryableGameEvent): event is QueryableResourceExchangedEvent =>
  event.type === 'resource.exchanged'

const isResourceMovedEvent = (event: QueryableGameEvent): event is QueryableResourceMovedEvent =>
  event.type === 'resource.moved'

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
