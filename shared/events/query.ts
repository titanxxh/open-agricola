import type { DraftGameEvent, GameEvent } from '../contract/events'

export type EventQuery = {
  has<T extends QueryableGameEvent['type']>(
    type: T,
    predicate?: (event: Extract<QueryableGameEvent, { type: T }>) => boolean,
  ): boolean
  find<T extends QueryableGameEvent['type']>(
    type: T,
    predicate?: (event: Extract<QueryableGameEvent, { type: T }>) => boolean,
  ): Extract<QueryableGameEvent, { type: T }> | undefined
  filter<T extends QueryableGameEvent['type']>(
    type: T,
    predicate?: (event: Extract<QueryableGameEvent, { type: T }>) => boolean,
  ): Extract<QueryableGameEvent, { type: T }>[]
}

export type QueryableGameEvent = GameEvent | DraftGameEvent

export const createEventQuery = (events: readonly QueryableGameEvent[]): EventQuery => {
  const find = <T extends QueryableGameEvent['type']>(
    type: T,
    predicate?: (event: Extract<QueryableGameEvent, { type: T }>) => boolean,
  ): Extract<QueryableGameEvent, { type: T }> | undefined =>
    events.find((event): event is Extract<QueryableGameEvent, { type: T }> => {
      if (event.type !== type) return false
      return predicate ? predicate(event as Extract<QueryableGameEvent, { type: T }>) : true
    })

  const filter = <T extends QueryableGameEvent['type']>(
    type: T,
    predicate?: (event: Extract<QueryableGameEvent, { type: T }>) => boolean,
  ): Extract<QueryableGameEvent, { type: T }>[] =>
    events.filter((event): event is Extract<QueryableGameEvent, { type: T }> => {
      if (event.type !== type) return false
      return predicate ? predicate(event as Extract<QueryableGameEvent, { type: T }>) : true
    })

  return {
    has: (type, predicate) => find(type, predicate) !== undefined,
    find,
    filter,
  }
}
