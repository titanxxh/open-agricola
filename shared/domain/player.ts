import type { GameState, PlayerState, Worker } from '../contract/types'
import { getCardHeldWorkerIds } from '../cards/helpers/card-held-workers'
import { findActionSpaceById, findActionSpaceByWorker } from './space'

export type PlayerQueryState = Pick<GameState, 'players'>

export const findPlayerById = (
  state: PlayerQueryState,
  playerId: unknown,
): PlayerState | undefined =>
  typeof playerId === 'string'
    ? state.players.find((player) => player.id === playerId)
    : undefined

export const findPlayerIndexById = (
  state: PlayerQueryState,
  playerId: unknown,
): number =>
  typeof playerId === 'string'
    ? state.players.findIndex((player) => player.id === playerId)
    : -1

export const hasPlayer = (
  state: PlayerQueryState,
  playerId: unknown,
): boolean =>
  findPlayerById(state, playerId) !== undefined

export const getPlayedCardKeys = (
  p: Pick<PlayerState, 'improvements' | 'minorPlayed' | 'occupationPlayed'>,
): string[] => [
  ...p.improvements.map((id) => `major:${id}`),
  ...p.minorPlayed.map((id) => `minor:${id}`),
  ...p.occupationPlayed.map((id) => `occupation:${id}`),
]

export const familySize = (p: PlayerState): number =>
  (p.workers ?? []).filter(w => w.isActive).length

export const getFamilyTokenLimit = (p: PlayerState): number =>
  (p.workers ?? []).filter(w => !w.removedFromSupply).length

export const inactiveWorkersInSupply = (p: PlayerState): Worker[] =>
  (p.workers ?? []).filter(w => !w.isActive && !w.removedFromSupply)

export const hasInactiveWorkerInSupply = (p: PlayerState): boolean =>
  inactiveWorkersInSupply(p).length > 0

export const newbornCount = (p: PlayerState): number =>
  (p.workers ?? []).filter(w => w.isActive && w.isNewborn).length

export const activeWorkers = (p: PlayerState): Worker[] =>
  (p.workers ?? []).filter(w => w.isActive)

export const isWorkerOnAnySpace = (
  state: GameState,
  playerId: string,
  workerId: string,
): boolean =>
  findActionSpaceByWorker(state, playerId, workerId) !== undefined

export const workersAtHome = (state: GameState, p: PlayerState): Worker[] => {
  const held = getCardHeldWorkerIds(p)
  return activeWorkers(p).filter(
    (w) => !isWorkerOnAnySpace(state, p.id, w.id) && !held.has(w.id),
  )
}

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
  const next = inactiveWorkersInSupply(p)[0]
  if (!next) return null
  next.isActive = true
  next.isNewborn = true
  return next
}

const TEST_SINK_SPACE_ID = '__test-worker-sink__'

const ensureTestSink = (state: GameState): import('../contract/types').ActionSpace => {
  let sink = findActionSpaceById(state, TEST_SINK_SPACE_ID)
  if (sink) return sink
  sink = {
    id: TEST_SINK_SPACE_ID,
    nameKey: 'test.sink.name',
    descriptionKey: 'test.sink.description',
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => false,
    execute: () => ({ type: 'ok' }),
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    takenBy: [],
  } as import('../contract/types').ActionSpace
  state.actionSpaces.push(sink)
  return sink
}

/**
 * Test helper: mark all active workers as "used" by placing WorkerRefs onto
 * a dedicated test-sink action space. This makes
 * `workersAvailable(state, p) === 0` for fixture setups that previously wrote
 * `p.workersAvailable = 0`. Uses a synthetic sink space so tests that manually
 * write to real action spaces (e.g. `forest.takenBy = 'p1'`) don't clobber it.
 */
export const markAllWorkersUsed = (state: GameState, p: PlayerState): void => {
  const sink = ensureTestSink(state)
  for (const w of p.workers ?? []) {
    if (!w.isActive) continue
    const onAny = findActionSpaceByWorker(state, p.id, w.id) !== undefined
    if (!onAny) {
      sink.takenBy.push({ playerId: p.id, workerId: w.id })
    }
  }
}

/**
 * Test helper: set exactly N active workers on player `p`.
 * Activates the first N workers (by id) and deactivates the rest.
 */
export const setActiveWorkerCount = (p: PlayerState, n: number): void => {
  const ws = (p.workers ?? []).slice().sort((a, b) => Number(a.id) - Number(b.id))
  for (let i = 0; i < ws.length; i += 1) {
    const w = ws[i]!
    w.isActive = i < n
    if (!w.isActive) w.isNewborn = false
  }
}

/**
 * Test helper: configure player `p` so `workersAvailable(state, p) === n`.
 * If the player has more active workers than `n`, places the excess onto the
 * first action space. If fewer, does nothing (would need activation).
 */
export const setWorkersAtHome = (
  state: GameState,
  p: PlayerState,
  n: number,
): void => {
  const active = (p.workers ?? []).filter(w => w.isActive)
  const toPlace = Math.max(0, active.length - n)
  if (toPlace <= 0) return
  const sink = ensureTestSink(state)
  let placed = 0
  for (const w of active) {
    if (placed >= toPlace) break
    const already = findActionSpaceByWorker(state, p.id, w.id) !== undefined
    if (already) continue
    sink.takenBy.push({ playerId: p.id, workerId: w.id })
    placed += 1
  }
}

/**
 * Test helper: set exactly N newborn workers among the player's active workers.
 * Marks the first N active workers (by id) as newborn, the rest as adult.
 */
export const setNewbornCount = (p: PlayerState, n: number): void => {
  const active = (p.workers ?? [])
    .filter(w => w.isActive)
    .sort((a, b) => Number(a.id) - Number(b.id))
  for (let i = 0; i < active.length; i += 1) {
    active[i]!.isNewborn = i < n
  }
}
