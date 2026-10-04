import type { GameState, LogEntry } from '../contract/types'

export const prependDerivedLogEntries = (
  state: Pick<GameState, 'log'>,
  entries: readonly LogEntry[],
): void => {
  state.log = [...entries, ...state.log]
}
