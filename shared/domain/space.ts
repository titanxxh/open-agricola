import type { ActionSpace, BlockedActionSpaceRef, GameState, WorkerRef } from '../contract/types'

export type ActionSpaceQueryState = Pick<GameState, 'actionSpaces'>

export const findActionSpaceById = (
  state: ActionSpaceQueryState,
  spaceId: string | null | undefined,
): ActionSpace | undefined => {
  if (!spaceId) return undefined
  return state.actionSpaces.find((space) => space.id === spaceId)
}

export const hasActionSpace = (
  state: ActionSpaceQueryState,
  spaceId: string,
): boolean =>
  findActionSpaceById(state, spaceId) !== undefined

export const filterActionSpacesByIds = (
  state: ActionSpaceQueryState,
  spaceIds: Iterable<string>,
): ActionSpace[] => {
  const wanted = new Set(spaceIds)
  return state.actionSpaces.filter((space) => wanted.has(space.id))
}

export const findActionSpaceByWorker = (
  state: ActionSpaceQueryState,
  playerId: string,
  workerId?: string,
): ActionSpace | undefined =>
  state.actionSpaces.find((space) =>
    space.takenBy.some((worker) =>
      worker.playerId === playerId &&
      (workerId === undefined || worker.workerId === workerId),
    ),
  )

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

export const canSpaceAcceptWorker = (s: ActionSpace): boolean => {
  if (s.maxOccupancy === null) return true
  const maxOccupancy = s.maxOccupancy ?? 1
  return s.takenBy.length < maxOccupancy
}

export const normalizeBlockedBy = (value: unknown): BlockedActionSpaceRef[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry): BlockedActionSpaceRef[] => {
    if (!entry || typeof entry !== 'object') return []
    const ref = entry as Partial<BlockedActionSpaceRef>
    if (
      typeof ref.playerId !== 'string' ||
      typeof ref.workerId !== 'string' ||
      typeof ref.sourceSpaceId !== 'string'
    ) {
      return []
    }
    return [{ playerId: ref.playerId, workerId: ref.workerId, sourceSpaceId: ref.sourceSpaceId }]
  })
}

export const isSpaceBlocked = (s: ActionSpace): boolean =>
  (s.blockedBy?.length ?? 0) > 0

export const addLinkedSpaceBlocks = (
  state: GameState,
  sourceSpace: ActionSpace,
  playerId: string,
  workerId: string,
): void => {
  if (!sourceSpace.linkedGroupId) return
  for (const space of state.actionSpaces) {
    if (space.id === sourceSpace.id) continue
    if (space.linkedGroupId !== sourceSpace.linkedGroupId) continue
    space.blockedBy = [
      ...(space.blockedBy ?? []).filter((block) =>
        block.playerId !== playerId || block.workerId !== workerId,
      ),
      { playerId, workerId, sourceSpaceId: sourceSpace.id },
    ]
  }
}

export const clearLinkedSpaceBlocksForWorker = (
  state: GameState,
  playerId: string,
  workerId: string,
): void => {
  for (const space of state.actionSpaces) {
    space.blockedBy = (space.blockedBy ?? []).filter((block) =>
      block.playerId !== playerId || block.workerId !== workerId,
    )
  }
}

export const clearAllLinkedSpaceBlocks = (state: GameState): void => {
  for (const space of state.actionSpaces) {
    space.blockedBy = []
  }
}

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
