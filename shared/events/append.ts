import type { DraftGameEvent, GameEvent } from '../contract/events'
import type { GameState } from '../contract/types'
import { prependDerivedLogEntries } from './log-cache'
import { eventsToLogEntries } from './log-mapper'
import { EventStore, type EventEnvelopeContext } from './store'

export type ImmediateEventDraft =
  | DraftGameEvent
  | (Record<string, unknown> & { type: GameEvent['type'] })

export const appendImmediateEvents = (
  state: GameState,
  drafts: ImmediateEventDraft[],
  defaults: EventEnvelopeContext = {},
): GameEvent[] => {
  if (drafts.length === 0) return []
  state.events ??= []
  state.nextEventSeq ??= 1
  const store = new EventStore()
  const frame = store.beginFrame(defaults)
  frame.sink.emitMany(drafts as DraftGameEvent[])
  frame.complete(state)
  const committed = store.commitTransaction(state)
  const playerNames = Object.fromEntries((state.players ?? []).map((player) => [player.id, player.name]))
  const actionNames = Object.fromEntries((state.actionSpaces ?? []).map((space) => [space.id, space.nameKey]))
  const entries = eventsToLogEntries(committed, { playerNames, actionNames })
  prependDerivedLogEntries(state, entries)
  return committed
}
