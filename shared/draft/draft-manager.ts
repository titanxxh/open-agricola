/**
 * Simultaneous card draft — pure state transitions.
 *
 * All exported functions are pure: they never mutate their inputs and always
 * return fresh objects (via `structuredClone` or manual copying).
 *
 * Lifecycle:
 *   initDraftState(...)            -> DraftState at round 1
 *   processSubmit(...)              -> records and keeps a player's pick this round
 *   tryAdvanceRound(...)            -> when all submitted, rotate remaining pools + bump round
 *   finalizeDraft(gameState)        -> write kept hands back to players, clear phase
 */

import type { DraftPickPayload, DraftPool, DraftStageKind, DraftStageSpec, DraftState } from './types'
import type { GameState } from '../contract/types'

export function initDraftState(
  seatOrder: string[],
  hands: Record<string, DraftPool>,
  poolSize: number,
  totalRounds = 7,
): DraftState {
  const pools: Record<string, DraftPool> = {}
  const kept: Record<string, DraftPool> = {}
  const pendingPicks: Record<string, { occ: string | null; minor: string | null }> = {}

  for (const pid of seatOrder) {
    const h = hands[pid]
    if (!h || h.occ.length !== poolSize || h.minor.length !== poolSize) {
      throw new Error(
        `bad initial hand for ${pid}: expected ${poolSize} occ/minor cards`,
      )
    }
    pools[pid] = { occ: [...h.occ], minor: [...h.minor] }
    kept[pid] = { occ: [], minor: [] }
    pendingPicks[pid] = { occ: null, minor: null }
  }

  return {
    mode: 'simultaneous',
    round: 1,
    totalRounds,
    poolSize,
    seatOrder: [...seatOrder],
    pools,
    kept,
    pendingPicks,
  }
}

export function initStagedDraftState(
  seatOrder: string[],
  stages: DraftStageSpec[],
): DraftState {
  if (stages.length === 0) {
    throw new Error('staged draft requires at least one stage')
  }
  const kept: Record<string, DraftPool> = {}
  const pendingPicks: Record<string, { occ: string | null; minor: string | null }> = {}

  for (const pid of seatOrder) {
    kept[pid] = { occ: [], minor: [] }
    pendingPicks[pid] = { occ: null, minor: null }
  }

  const first = normalizeStage(seatOrder, stages[0])
  return {
    mode: 'simultaneous',
    stage: first.kind,
    stageIndex: 0,
    stages: stages.map((stage) => normalizeStage(seatOrder, stage)),
    round: 1,
    totalRounds: first.totalRounds,
    poolSize: first.poolSize,
    seatOrder: [...seatOrder],
    pools: structuredClone(first.pools),
    kept,
    pendingPicks,
  }
}

function normalizeStage(seatOrder: string[], stage: DraftStageSpec): DraftStageSpec {
  const pools: Record<string, DraftPool> = {}
  for (const pid of seatOrder) {
    const pool = stage.pools[pid]
    if (!pool) {
      throw new Error(`bad initial hand for ${pid}: missing ${stage.kind} pool`)
    }
    const activeLength = stage.kind === 'occupation' ? pool.occ.length : pool.minor.length
    if (activeLength !== stage.poolSize) {
      throw new Error(
        `bad initial hand for ${pid}: expected ${stage.poolSize} ${stage.kind} cards`,
      )
    }
    pools[pid] = { occ: [...pool.occ], minor: [...pool.minor] }
  }
  return { ...stage, pools }
}

const activeStageKind = (draft: DraftState): DraftStageKind => draft.stage ?? 'standard'

const isMinorStage = (stage: DraftStageKind): boolean =>
  stage === 'farmersOfTheMoorMinor' || stage === 'publishedMinor'

const isSubmittedForStage = (
  pick: { occ: string | null; minor: string | null } | undefined,
  stage: DraftStageKind,
): boolean => {
  if (!pick) return false
  if (stage === 'standard') return pick.occ !== null && pick.minor !== null
  if (stage === 'occupation') return pick.occ !== null
  return pick.minor !== null
}

export function processSubmit(
  draft: DraftState,
  pid: string,
  pick: DraftPickPayload,
): { draft: DraftState; error?: string } {
  if (!draft.pools[pid] || !draft.pendingPicks[pid]) {
    return { draft, error: `unknown player ${pid}` }
  }
  const stage = activeStageKind(draft)
  const submittedPick = draft.pendingPicks[pid]
  if (isSubmittedForStage(submittedPick, stage)) {
    const isRetry = stage === 'standard'
      ? submittedPick.occ === pick.occCardId && submittedPick.minor === pick.minorCardId
      : stage === 'occupation'
        ? submittedPick.occ === pick.occCardId
        : submittedPick.minor === pick.minorCardId
    return isRetry ? { draft } : { draft, error: `already submitted this round` }
  }
  if (stage === 'standard' || stage === 'occupation') {
    if (!pick.occCardId || !draft.pools[pid].occ.includes(pick.occCardId)) {
      return { draft, error: `occ card not in pool` }
    }
  }
  if (stage === 'standard' || isMinorStage(stage)) {
    if (!pick.minorCardId || !draft.pools[pid].minor.includes(pick.minorCardId)) {
      return { draft, error: `minor card not in pool` }
    }
  }

  const next = structuredClone(draft)
  if (stage === 'standard') {
    next.pendingPicks[pid] = { occ: pick.occCardId!, minor: pick.minorCardId! }
    next.kept[pid].occ.push(pick.occCardId!)
    next.kept[pid].minor.push(pick.minorCardId!)
    next.pools[pid] = {
      occ: next.pools[pid].occ.filter((id) => id !== pick.occCardId),
      minor: next.pools[pid].minor.filter((id) => id !== pick.minorCardId),
    }
    return { draft: next }
  }
  if (stage === 'occupation') {
    next.pendingPicks[pid] = { occ: pick.occCardId!, minor: null }
    next.kept[pid].occ.push(pick.occCardId!)
    next.pools[pid] = {
      ...next.pools[pid],
      occ: next.pools[pid].occ.filter((id) => id !== pick.occCardId),
    }
    return { draft: next }
  }
  next.pendingPicks[pid] = { occ: null, minor: pick.minorCardId! }
  next.kept[pid].minor.push(pick.minorCardId!)
  next.pools[pid] = {
    ...next.pools[pid],
    minor: next.pools[pid].minor.filter((id) => id !== pick.minorCardId),
  }
  return { draft: next }
}

export function tryAdvanceRound(draft: DraftState): {
  draft: DraftState
  advanced: boolean
  finished: boolean
} {
  const stage = activeStageKind(draft)
  const allSubmitted = draft.seatOrder.every(
    (pid) =>
      draft.pendingPicks[pid] != null &&
      isSubmittedForStage(draft.pendingPicks[pid], stage),
  )
  if (!allSubmitted) return { draft, advanced: false, finished: false }

  const next = structuredClone(draft)

  // 1. Clockwise rotation: seat[i]'s pool -> seat[(i+1) % n].
  const n = next.seatOrder.length
  const rotated: Record<string, DraftPool> = {}
  for (let i = 0; i < n; i++) {
    const from = next.seatOrder[i]
    const to = next.seatOrder[(i + 1) % n]
    rotated[to] = next.pools[from]
  }
  next.pools = rotated

  // 2. Advance round.
  next.round += 1

  // 3. Reset pendingPicks for the new round.
  for (const pid of next.seatOrder) {
    next.pendingPicks[pid] = { occ: null, minor: null }
  }

  const autoFinished = autoKeepFinalSingleCardPools(next)
  const stageFinished = autoFinished || next.round > next.totalRounds
  if (stageFinished && next.stages && next.stageIndex !== undefined) {
    const nextStageIndex = next.stageIndex + 1
    const nextStage = next.stages[nextStageIndex]
    if (nextStage) {
      next.stageIndex = nextStageIndex
      next.stage = nextStage.kind
      next.round = 1
      next.totalRounds = nextStage.totalRounds
      next.poolSize = nextStage.poolSize
      next.pools = structuredClone(nextStage.pools)
      for (const pid of next.seatOrder) {
        next.pendingPicks[pid] = { occ: null, minor: null }
      }
      return { draft: next, advanced: true, finished: false }
    }
  }
  const finished = stageFinished
  return { draft: next, advanced: true, finished }
}

function autoKeepFinalSingleCardPools(draft: DraftState): boolean {
  if (draft.round !== draft.totalRounds) return false
  const stage = activeStageKind(draft)
  const allPoolsAreSingleCard = draft.seatOrder.every((pid) => {
    const pool = draft.pools[pid]
    if (!pool) return false
    if (stage === 'standard') return pool.occ.length === 1 && pool.minor.length === 1
    if (stage === 'occupation') return pool.occ.length === 1
    return pool.minor.length === 1
  })
  if (!allPoolsAreSingleCard) return false

  for (const pid of draft.seatOrder) {
    const pool = draft.pools[pid]
    if (stage === 'standard') {
      draft.kept[pid].occ.push(pool.occ[0])
      draft.kept[pid].minor.push(pool.minor[0])
      draft.pools[pid] = { occ: [], minor: [] }
    } else if (stage === 'occupation') {
      draft.kept[pid].occ.push(pool.occ[0])
      draft.pools[pid] = { ...pool, occ: [] }
    } else {
      draft.kept[pid].minor.push(pool.minor[0])
      draft.pools[pid] = { ...pool, minor: [] }
    }
  }
  draft.round += 1
  return true
}

/**
 * Writes each player's `kept` hands back to a fresh PlayerState, flips
 * `phase='playing'`, and clears `state.draft`. The input state is not mutated:
 * a new top-level object is returned with new `players`, new `phase`, and
 * `draft=null`. All other fields are aliased (shallow copy) — notably
 * `actionSpaces` which carries function refs that cannot be `structuredClone`d.
 * Callers that need deeper isolation should clone upstream.
 */
export function finalizeDraft(state: GameState): GameState {
  if (!state.draft) throw new Error('no draft to finalize')
  const draft = state.draft
  const nextPlayers = state.players.map((player) => {
    const k = draft.kept[player.id]
    if (!k) return { ...player }
    return {
      ...player,
      occupationHand: [...k.occ],
      minorHand: [...k.minor],
    }
  })
  return {
    ...state,
    players: nextPlayers,
    phase: 'playing',
    draft: null,
  }
}
