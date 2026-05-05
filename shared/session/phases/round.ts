/**
 * Round-phase pure helpers extracted from GameCore (S2 Task 10).
 *
 * Currently hosts only the seat-walk helpers (nextSeatedPlayerIdx,
 * computeStartPlayerIdx) — the side-effect-heavy paths (takeAction,
 * confirm-* triggers/handlers, round transition, returningHome /
 * roundEnd continuations) remain in GameCore because they read/write
 * engineStack / history / actionStartIndex / state in tightly coupled
 * sequences. Migrating those paths into a RoundPhase mixin requires a
 * dedicated pass (deferred to a follow-up sprint per the S2 plan).
 */

import type { GameState, PlayerState } from '../../game/types.ts'
import { workersAvailable } from '../../game/player.ts'

/**
 * Find the next seated player (in turn order) who still has at least one
 * worker available. Returns the current index if no other player has a
 * free worker (caller treats this as "stay on the same seat").
 */
export const nextSeatedPlayerIdx = (
  state: GameState,
  players: PlayerState[],
  current: number,
): number => {
  for (let off = 1; off <= players.length; off++) {
    const idx = (current + off) % players.length
    const candidate = players[idx]
    if (candidate && workersAvailable(state, candidate) > 0) return idx
  }
  return current
}

/**
 * Resolve the starting-player seat index. Returns 0 when no player owns
 * the start-player marker (matches the legacy GameCore.getStartPlayerIdx
 * fallback).
 */
export const computeStartPlayerIdx = (state: GameState): number => {
  const startIdx = state.players.findIndex((player) => player.startPlayer)
  return startIdx === -1 ? 0 : startIdx
}
