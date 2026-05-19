import type { GameEvent } from '../contract/events'

export type EventQuery = {
  has<T extends GameEvent['type']>(
    type: T,
    predicate?: (event: Extract<GameEvent, { type: T }>) => boolean,
  ): boolean
  find<T extends GameEvent['type']>(
    type: T,
    predicate?: (event: Extract<GameEvent, { type: T }>) => boolean,
  ): Extract<GameEvent, { type: T }> | undefined
  filter<T extends GameEvent['type']>(
    type: T,
    predicate?: (event: Extract<GameEvent, { type: T }>) => boolean,
  ): Extract<GameEvent, { type: T }>[]
}

export const createEventQuery = (events: readonly GameEvent[]): EventQuery => {
  const find = <T extends GameEvent['type']>(
    type: T,
    predicate?: (event: Extract<GameEvent, { type: T }>) => boolean,
  ): Extract<GameEvent, { type: T }> | undefined =>
    events.find((event): event is Extract<GameEvent, { type: T }> => {
      if (event.type !== type) return false
      return predicate ? predicate(event as Extract<GameEvent, { type: T }>) : true
    })

  const filter = <T extends GameEvent['type']>(
    type: T,
    predicate?: (event: Extract<GameEvent, { type: T }>) => boolean,
  ): Extract<GameEvent, { type: T }>[] =>
    events.filter((event): event is Extract<GameEvent, { type: T }> => {
      if (event.type !== type) return false
      return predicate ? predicate(event as Extract<GameEvent, { type: T }>) : true
    })

  return {
    has: (type, predicate) => find(type, predicate) !== undefined,
    find,
    filter,
  }
}
