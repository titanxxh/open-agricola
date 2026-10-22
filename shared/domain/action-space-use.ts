import type { ActionExecutionContext, ActionSpaceUseContext, GameState } from '../contract/types'
import type { ActionSpaceUseStartedEvent, DraftGameEvent, EventSink, GameEvent } from '../contract/events'
import { appendImmediateEvents } from '../events/append'

/** Called only after a real destination is accepted, before its before reactions. */
export function recordActionSpaceUse(
  context: Pick<ActionExecutionContext, 'state' | 'player' | 'space' | 'sourceCard' | 'completedTransactionEvents'> & { eventSink?: EventSink },
  use: ActionSpaceUseContext,
): ActionSpaceUseContext {
  const { state, player, space, eventSink, sourceCard } = context
  const nextSequence = context.completedTransactionEvents?.reduce((next, event) => Math.max(next, event.seq + 1), state.nextEventSeq) ?? state.nextEventSeq
  const useId = `space-use:${nextSequence}`
  const event = {
    type: 'actionSpace.useStarted' as const,
    useId,
    spaceId: space.id,
    newPlacement: use.newPlacement,
    ...(use.personUse ? { personUse: use.personUse } : {}),
    accumulation: { ...space.gainPerRound },
    workPhase: state.roundPhase === 'work' || state.roundPhase === 'returning-home'
      && !state.events.some(entry => entry.round === state.round && entry.type === 'work.ended'),
    actorPlayerId: player.id,
    sourceActionId: space.id,
    sourceCardId: sourceCard,
  }
  if (eventSink) eventSink.emit(event)
  else appendImmediateEvents(state, [event])
  return { ...use, useId }
}

/** The entry identity freezes the prefix even when another before reaction starts a nested use. */
export function getRoundActionSpaceUses(
  state: GameState, playerId: string, throughUseId: string | undefined,
  transactionEvents: readonly (GameEvent | DraftGameEvent)[] = [],
): ActionSpaceUseStartedEvent[] {
  const entries: ActionSpaceUseStartedEvent[] = []
  const seen = new Set<string>()
  const completed = transactionEvents.filter((event): event is GameEvent => 'schemaVersion' in event)
  for (const event of [...state.events, ...completed]) {
    if (event.type !== 'actionSpace.useStarted' || event.round !== state.round || event.actorPlayerId !== playerId || seen.has(event.useId)) continue
    seen.add(event.useId)
    entries.push(event)
    if (event.useId === throughUseId) return entries
  }
  return []
}
