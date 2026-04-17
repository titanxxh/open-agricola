import type { ActionSpace, WorkerRef } from './types'

export const isSpaceOccupied = (s: ActionSpace): boolean =>
  Array.isArray(s.takenBy) ? s.takenBy.length > 0 : s.takenBy !== null

export const spaceOccupantCount = (s: ActionSpace): number =>
  Array.isArray(s.takenBy) ? s.takenBy.length : s.takenBy ? 1 : 0

export const spaceHasPlayer = (s: ActionSpace, playerId: string): boolean =>
  Array.isArray(s.takenBy)
    ? s.takenBy.some(t => (t as unknown as WorkerRef).playerId === playerId)
    : s.takenBy === playerId

export const addWorkerRef = (s: ActionSpace, playerId: string, workerId: string): void => {
  if (!Array.isArray(s.takenBy)) {
    ;(s as unknown as { takenBy: WorkerRef[] }).takenBy = []
  }
  ;(s.takenBy as unknown as WorkerRef[]).push({ playerId, workerId })
}

export const removeWorkerRef = (
  s: ActionSpace,
  playerId: string,
  workerId?: string,
): WorkerRef | null => {
  if (!Array.isArray(s.takenBy)) return null
  const arr = s.takenBy as unknown as WorkerRef[]
  const idx = workerId
    ? arr.findIndex(t => t.playerId === playerId && t.workerId === workerId)
    : arr.findIndex(t => t.playerId === playerId)
  if (idx < 0) return null
  const [removed] = arr.splice(idx, 1)
  return removed
}
