import type { GameState, LogEntry } from '../contract/types'

export const prependDerivedLogEntries = (
  state: Pick<GameState, 'log'>,
  entries: readonly LogEntry[],
): void => {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    state.log.unshift(entries[index]!)
  }
}
