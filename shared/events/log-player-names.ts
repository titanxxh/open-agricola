import type { LogEntry } from '../contract/types'

/** Resolve display text by identity without changing the authoritative log cache. */
export const resolveLogPlayerNames = (
  entry: LogEntry,
  playerNames: Readonly<Record<string, string>>,
): LogEntry => {
  if (!entry.params) return entry
  const refs = { ...entry.playerRefs }
  if (entry.playerId) {
    refs.player ??= entry.playerId
    refs.playerName ??= entry.playerId
  }
  const params = { ...entry.params }
  for (const [key, playerId] of Object.entries(refs)) {
    if (typeof params[key] === 'string' && playerNames[playerId] !== undefined) {
      params[key] = playerNames[playerId]
    }
  }
  return { ...entry, params }
}
