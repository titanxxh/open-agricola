import type { LogEntry } from '../contract/types'

export const isHistoryParticipantNameKey = (key: string): boolean => ['player', 'playerName', 'fromPlayer', 'toPlayer'].includes(key)
export const isHistoryParticipantNamePath = (path: string): boolean => path.startsWith('params.') && isHistoryParticipantNameKey(path.split('.').at(-1)!)

/** Identity-based names are presentation only; exact saved parameters remain unchanged. */
export const projectHistoryLogNames = (entry: LogEntry, roles: Record<string, string> | undefined, names: Record<string, string>): LogEntry => {
  let projected: LogEntry | undefined
  for (const [path, playerId] of Object.entries(roles ?? {})) {
    const keys = path.split('.')
    if (!isHistoryParticipantNamePath(path) || names[playerId] === undefined) continue
    const parentKeys = keys.slice(0, -1)
    const parent = (value: LogEntry): Record<string, unknown> | undefined => {
      let target = value as unknown as Record<string, unknown>
      for (const key of parentKeys) {
        const child = target[key]
        if (!child || typeof child !== 'object') return undefined
        target = child as Record<string, unknown>
      }
      return target
    }
    const current = parent(projected ?? entry)
    if (!current || current[keys.at(-1)!] === names[playerId]) continue
    projected ??= JSON.parse(JSON.stringify(entry)) as LogEntry
    const target = parent(projected)!
    target[keys.at(-1)!] = names[playerId]
  }
  return projected ?? entry
}

