import type {
  ActionDefinition,
  ActionExecutionResult,
  ActionSpace,
  GameState,
  PlayerState,
} from '../../game/types'
import { recordRoundPlacement } from '../../cards/helpers/round-placement'
import { addWorkerRef, isSpaceOccupied } from '../../game/space'
import { smallestAvailableWorker } from '../../game/player'
import { computeAllowedPlacementSpaces } from './placement-availability'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from './placement-constants'

export { OCCUPIED_SPACE_CHOICE_PREFIX } from './placement-constants'

/**
 * Low-level helper: place a worker belonging to `player` onto `space`.
 *
 * Picks the smallest-id worker currently at home via `smallestAvailableWorker`.
 * This helper does NOT guard against already-occupied spaces — callers that
 * respect the "space free" rule must check `isSpaceOccupied(space)` first.
 * (canUseOccupied paths bypass that check intentionally.)
 */
export const placeFarmer = (
  state: GameState,
  player: PlayerState,
  space: ActionSpace,
): ActionExecutionResult => {
  const worker = smallestAvailableWorker(state, player)
  if (!worker) {
    return { type: 'fail', logKey: 'log.placeFarmerFail' }
  }
  addWorkerRef(space, player.id, worker.id)
  recordRoundPlacement(player, space.id, worker.id)
  return { type: 'ok' }
}

export type PlaceFarmerOnSpaceResult =
  | { ok: true; space: ActionSpace }
  | { ok: false; reason: 'invalid' | 'no-worker' }

export function placeFarmerOnSpace(
  state: GameState,
  player: PlayerState,
  spaceId: string,
): PlaceFarmerOnSpaceResult {
  const allowed = computeAllowedPlacementSpaces(state, player)
  if (!allowed.some(a => a.spaceId === spaceId)) return { ok: false, reason: 'invalid' }
  const space = state.actionSpaces.find(s => s.id === spaceId)!
  const worker = smallestAvailableWorker(state, player)
  if (!worker) return { ok: false, reason: 'no-worker' }
  addWorkerRef(space, player.id, worker.id)
  recordRoundPlacement(player, space.id, worker.id)
  return { ok: true, space }
}

export const placeFarmerAction: ActionDefinition = {
  id: 'place-farmer',
  nameKey: 'actions.place-farmer.name',
  descriptionKey: 'actions.place-farmer.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player) =>
    smallestAvailableWorker(state, player) !== null,
  execute: ({ state, player, actionContext }) => {
    if (actionContext?.fromSupply) {
      const supply = (player.workers ?? []).find((w) => !w.isActive)
      if (!supply) return { type: 'fail', logKey: 'log.placeFarmerFail' }
      supply.isActive = true
    }
    const available = state.actionSpaces
      .filter((s) => !isSpaceOccupied(s) && s.canBeExecutedByPlayer(state, player))
      .map((s) => ({ value: s.id, labelKey: s.nameKey }))
    if (available.length === 0) return { type: 'fail', logKey: 'log.placeFarmerFail' }
    return {
      type: 'choice',
      promptKey: 'ui.interactionPlaceFarmerExtra',
      options: available,
    }
  },
  resolveChoice: ({ state, player }, choice) => {
    const allowOccupied = choice.startsWith(OCCUPIED_SPACE_CHOICE_PREFIX)
    const targetSpaceId = allowOccupied
      ? choice.slice(OCCUPIED_SPACE_CHOICE_PREFIX.length)
      : choice
    const targetSpace = state.actionSpaces.find((s) => s.id === targetSpaceId)
    if (!targetSpace) return { type: 'fail', logKey: 'log.placeFarmerFail' }
    if (isSpaceOccupied(targetSpace) && !allowOccupied) {
      return { type: 'fail', logKey: 'log.placeFarmerFail' }
    }
    const placeResult = placeFarmer(state, player, targetSpace)
    if (placeResult.type === 'fail') return placeResult
    const result = targetSpace.execute({ state, player, space: targetSpace })
    if (result.type === 'flow') return result
    return result
  },
}
