import type { ActionSpace, WorkerRef } from '../contract/types'

/**
 * Coerce a deserialized or test-fixture `takenBy` into a `WorkerRef[]`.
 *
 * Tests sometimes set `space.takenBy = playerId` for brevity (auto-pinned to
 * worker '1'); this helper keeps that shorthand working when the value is
 * piped through `loadState` / `rehydrateState`.
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

export const addSyntheticLinkedOccupancyRef = (
  s: ActionSpace,
  playerId: string,
  linkedWorkerId: string,
  sourceCard: string,
): void => {
  s.takenBy.push({
    playerId,
    workerId: linkedWorkerId,
    synthetic: {
      kind: 'linked-occupancy',
      sourceCard,
      linkedWorkerId,
    },
  })
}

export const isSyntheticLinkedOccupancy = (
  ref: WorkerRef | undefined,
  match?: { sourceCard?: string; linkedWorkerId?: string },
): boolean => {
  if (ref?.synthetic?.kind !== 'linked-occupancy') return false
  if (match?.sourceCard !== undefined && ref.synthetic.sourceCard !== match.sourceCard) return false
  if (match?.linkedWorkerId !== undefined && ref.synthetic.linkedWorkerId !== match.linkedWorkerId) return false
  return true
}

export const removeSyntheticLinkedOccupancyRefs = (
  s: ActionSpace,
  playerId: string,
  linkedWorkerId: string,
): WorkerRef[] => {
  const removed: WorkerRef[] = []
  s.takenBy = s.takenBy.filter((ref) => {
    const match =
      ref.playerId === playerId &&
      isSyntheticLinkedOccupancy(ref, { linkedWorkerId })
    if (match) removed.push(ref)
    return !match
  })
  return removed
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
