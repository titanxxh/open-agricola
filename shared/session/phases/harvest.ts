/**
 * Harvest-phase pure helpers extracted from GameCore (S2 Task 11).
 *
 * Currently hosts the seat-walk that defines harvest order
 * (`getHarvestPlayerIndices`). Field / Feed / Breed phase entry points
 * and the 12 stage-hook handlers (`continueBeforeHarvest`, etc.) remain
 * in GameCore because each one mutates engineStack / runEngineSteps in
 * tightly coupled order. Migration to a HarvestPhase mixin is queued
 * behind the same constructor-coupling work that defers Setup mixin
 * full migration (see phases/setup.ts header).
 */

import type { GameState } from '../../game/types.ts'
import { computeStartPlayerIdx } from './round.ts'

/**
 * Compute the per-harvest seat order — start player first, then wrap
 * forward through remaining seats. Returns a fresh array of indices each
 * call (caller is free to mutate / iterate).
 */
export const getHarvestPlayerIndices = (state: GameState): number[] => {
  const players = state.players
  const startIdx = computeStartPlayerIdx(state)
  return players.map((_, offset) => (startIdx + offset) % players.length)
}
