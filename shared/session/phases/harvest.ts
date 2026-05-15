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

import type { GameState } from '../../contract/types.ts'
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
  core.state.completedFeedingPhases += 1
  core.state.roundPhase = 'breeding'
  return core.invokeAfterFeedingPhase()
}

/**
 * Continuation after a player's reorganize sub-flow during the
 * harvest-breed phase. Walk to the next player still owing a harvest
 * reorg; if none, trampoline into the onEndHarvest stage-hook chain.
 * Migrated from GameCore.continueAfterReorganize_harvestBreed
 * (S2 Task 11 part 3).
 */
export const continueAfterReorganizeHarvestBreed = (
  core: GameCore,
  playerIndex: number,
): void => {
  const nextPending = core.findNextHarvestReorgPlayerIndex(playerIndex)
  if (nextPending !== -1) {
    core.startReorgSubFlow(nextPending, 'harvest-breed')
    return
  }
  core.invokeEndHarvestEffects()
}
