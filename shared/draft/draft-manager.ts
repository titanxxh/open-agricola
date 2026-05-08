/**
 * Simultaneous card draft — pure state transitions.
 *
 * All exported functions are pure: they never mutate their inputs and always
 * return fresh objects (via `structuredClone` or manual copying).
 *
 * Lifecycle:
 *   initDraftState(...)            -> DraftState at round 1
 *   processSubmit(...)              -> records a player's pick this round
 *   tryAdvanceRound(...)            -> when all submitted, rotate pools + bump round
 *   finalizeDraft(gameState)        -> write kept hands back to players, clear phase
 */

import type { DraftPickPayload, DraftPool, DraftState } from './types'
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

export function processSubmit(
  draft: DraftState,
  pid: string,
  pick: DraftPickPayload,
): { draft: DraftState; error?: string } {
  if (!draft.pools[pid] || !draft.pendingPicks[pid]) {
    return { draft, error: `unknown player ${pid}` }
  }
  if (!draft.pools[pid].occ.includes(pick.occCardId)) {
    return { draft, error: `occ card not in pool` }
  }
  if (!draft.pools[pid].minor.includes(pick.minorCardId)) {
    return { draft, error: `minor card not in pool` }
  }
  if (draft.pendingPicks[pid].occ !== null || draft.pendingPicks[pid].minor !== null) {
    return { draft, error: `already submitted this round` }
  }

  const next = structuredClone(draft)
  next.pendingPicks[pid] = { occ: pick.occCardId, minor: pick.minorCardId }
  return { draft: next }
}

export function tryAdvanceRound(draft: DraftState): {
  draft: DraftState
  advanced: boolean
  finished: boolean
} {
  const allSubmitted = draft.seatOrder.every(
    (pid) =>
      draft.pendingPicks[pid] != null &&
      draft.pendingPicks[pid].occ !== null &&
      draft.pendingPicks[pid].minor !== null,
  )
  if (!allSubmitted) return { draft, advanced: false, finished: false }

  const next = structuredClone(draft)

  // 1. Append picks to kept.
  for (const pid of next.seatOrder) {
    const p = next.pendingPicks[pid]
    next.kept[pid].occ.push(p.occ as string)
    next.kept[pid].minor.push(p.minor as string)
  }

  // 2. Remove picks from each player's current pool BEFORE rotation.
  for (const pid of next.seatOrder) {
    const p = next.pendingPicks[pid]
    next.pools[pid] = {
      occ: next.pools[pid].occ.filter((id) => id !== p.occ),
      minor: next.pools[pid].minor.filter((id) => id !== p.minor),
    }
  }

  // 3. Clockwise rotation: seat[i]'s pool -> seat[(i+1) % n].
  const n = next.seatOrder.length
  const rotated: Record<string, DraftPool> = {}
  for (let i = 0; i < n; i++) {
    const from = next.seatOrder[i]
    const to = next.seatOrder[(i + 1) % n]
    rotated[to] = next.pools[from]
  }
  next.pools = rotated

  // 4. Advance round.
  next.round += 1

  // 5. Reset pendingPicks for the new round.
  for (const pid of next.seatOrder) {
    next.pendingPicks[pid] = { occ: null, minor: null }
  }

  const finished = next.round > next.totalRounds
  return { draft: next, advanced: true, finished }
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
