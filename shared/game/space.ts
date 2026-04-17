import type { ActionSpace, WorkerRef } from './types'

/**
 * Normalize a legacy `takenBy` value to the new `WorkerRef[]` shape.
 * - `undefined` / `null` → `[]`
 * - `'playerId'` (legacy string) → `[{ playerId, workerId: '1' }]` (best-effort fallback;
 *   old snapshots will re-pin a worker on next placement)
 * - already-array → returned as-is
 */
export const normalizeTakenBy = (value: unknown): WorkerRef[] => {
  if (!value) return []
  if (Array.isArray(value)) return value as WorkerRef[]
  if (typeof value === 'string') {
    return [{ playerId: value, workerId: '1' }]
  }
  return []
}

export const isSpaceOccupied = (s: ActionSpace): boolean =>
  s.takenBy.length > 0

export const spaceOccupantCount = (s: ActionSpace): number =>
  s.takenBy.length

export const spaceHasPlayer = (s: ActionSpace, playerId: string): boolean =>
  s.takenBy.some(t => t.playerId === playerId)

export const addWorkerRef = (s: ActionSpace, playerId: string, workerId: string): void => {
  s.takenBy.push({ playerId, workerId })
}

export const removeWorkerRef = (
  s: ActionSpace,
  playerId: string,
  workerId?: string,
): WorkerRef | null => {
  const arr = s.takenBy
  const idx = workerId
    ? arr.findIndex(t => t.playerId === playerId && t.workerId === workerId)
    : arr.findIndex(t => t.playerId === playerId)
  if (idx < 0) return null
  const [removed] = arr.splice(idx, 1)
  return removed
}
