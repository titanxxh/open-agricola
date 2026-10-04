import type { LogEntry } from '../contract/types'

/** Identity-based names are presentation only; exact saved parameters remain unchanged. */
export const projectHistoryLogNames = (entry: LogEntry, roles: Record<string, string> | undefined, names: Record<string, string>): LogEntry => {
  let projected: LogEntry | undefined
  for (const [path, playerId] of Object.entries(roles ?? {})) {
    const keys = path.split('.')
    if (keys[0] !== 'params' || !['player', 'playerName', 'fromPlayer', 'toPlayer'].includes(keys.at(-1)!) || names[playerId] === undefined) continue
    projected ??= JSON.parse(JSON.stringify(entry)) as LogEntry
    let target = projected as unknown as Record<string, unknown>
    for (const key of keys.slice(0, -1)) {
      const child = target[key]
      if (!child || typeof child !== 'object') { target = {}; break }
      target = child as Record<string, unknown>
    }
    target[keys.at(-1)!] = names[playerId]
  }
  return projected ?? entry
}

