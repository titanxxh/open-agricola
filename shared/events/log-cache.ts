import type { GameState, LogEntry } from '../contract/types'

export const prependDerivedLogEntries = (
  state: Pick<GameState, 'log'>,
  entries: readonly LogEntry[],
): void => {
  state.log = [...entries, ...state.log]
}

/**
 * Replaces, in place, the rows derived from one event occurrence with entries
 * freshly mapped from its rewritten fact. Rows of other events are untouched.
 */
export const replaceDerivedLogEntries = (
  state: Pick<GameState, 'log'>,
  entries: readonly LogEntry[],
  occurrenceId: string,
): void => {
  const first = state.log.findIndex(entry => entry.sourceEvent?.occurrenceId === occurrenceId)
  if (first === -1) return
  const kept = state.log.filter(entry => entry.sourceEvent?.occurrenceId !== occurrenceId)
  state.log = [...kept.slice(0, first), ...entries, ...kept.slice(first)]
}
