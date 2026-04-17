import type { GameState, PlayerState, Worker } from './types'

export const familySize = (p: PlayerState): number =>
  (p.workers ?? []).filter(w => w.isActive).length

export const newbornCount = (p: PlayerState): number =>
  (p.workers ?? []).filter(w => w.isActive && w.isNewborn).length

export const activeWorkers = (p: PlayerState): Worker[] =>
  (p.workers ?? []).filter(w => w.isActive)

export const isWorkerOnAnySpace = (
  state: GameState,
  playerId: string,
  workerId: string,
): boolean =>
  state.actionSpaces.some(s =>
    s.takenBy.some(t => t.playerId === playerId && t.workerId === workerId),
  )

export const workersAtHome = (state: GameState, p: PlayerState): Worker[] =>
  activeWorkers(p).filter(w => !isWorkerOnAnySpace(state, p.id, w.id))

export const workersAvailable = (state: GameState, p: PlayerState): number =>
  workersAtHome(state, p).length

export const smallestAvailableWorker = (
  state: GameState,
  p: PlayerState,
): Worker | null => {
  const home = workersAtHome(state, p)
  if (home.length === 0) return null
  return [...home].sort((a, b) => Number(a.id) - Number(b.id))[0]
}

export const findFirstNewborn = (p: PlayerState): Worker | null =>
  p.workers.find(w => w.isActive && w.isNewborn) ?? null

export const activateSmallestInactive = (p: PlayerState): Worker | null => {
  const next = (p.workers ?? []).find(w => !w.isActive)
  if (!next) return null
  next.isActive = true
  next.isNewborn = true
  return next
}
