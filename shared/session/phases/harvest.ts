/**
 * Harvest-phase mixin extracted from GameCore (S2 Task 11).
 *
 * Hosts the harvest-order seat walk plus the harvest / breed phase
 * entry points. The 12 stage-hook handlers (`continueBeforeHarvest`
 * etc.) and the field/feed sub-flow drivers stay in GameCore because
 * they form a deeply continuation-passing chain that's easier to
 * keep in one file; each handler is wrapped in an `invoke*` accessor
 * on GameCore for cross-module phase calls.
 */

import type { GameState } from '../../game/types.ts'
import { computeStartPlayerIdx } from './round.ts'
import type { GameCore, SessionResponse } from '../session-core.ts'

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

/**
 * Enter the harvest phase: mark `state.roundPhase = 'harvest'`, log the
 * harvest banner, then trampoline into the `beforeHarvest` stage-hook
 * chain (which lives on GameCore as continueHarvestFromBeforeHarvest).
 */
export const startHarvest = (core: GameCore): SessionResponse => {
  core.state.roundPhase = 'harvest'
  core.state.log.unshift({ key: 'log.harvest', params: { round: core.state.round } })
  return core.invokeHarvestFromBeforeHarvest()
}

/**
 * Enter the breeding phase: mark `state.roundPhase = 'breeding'`, then
 * trampoline into the breed-phase continuation chain on GameCore.
 */
export const startBreedPhase = (core: GameCore): SessionResponse => {
  core.state.roundPhase = 'breeding'
  return core.invokeAfterFeedingPhase()
}
