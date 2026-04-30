import type {
  ActionDefinition,
  ActionExecutionResult,
  ActionSpace,
  GameState,
  PlayerState,
} from '../../game/types'
import { recordRoundPlacement } from '../../cards/helpers/round-placement'
import { addWorkerRef, removeWorkerRef } from '../../game/space'
import { smallestAvailableWorker } from '../../game/player'
import { incPlacedFarmers } from '../../logic/stats'
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
    // viaCardJump branch (Sprint 5 mech-A): move farmer + return flow leaf so
    // the engine runs the second placement through the standard ActionNode path.
    if (actionContext?.viaCardJump) {
      const sourceCard = actionContext.sourceCard as string | undefined
      const workerId = actionContext.workerId as string | undefined
      const targetSpaceId = actionContext.targetSpaceId as string | undefined
      if (!sourceCard || !workerId || !targetSpaceId) {
        return { type: 'fail', logKey: 'log.placeFarmerFail' }
      }

      const fromSpace = state.actionSpaces.find(s =>
        s.takenBy.some(t => t.playerId === player.id && t.workerId === workerId),
      )
      const targetSpace = state.actionSpaces.find(s => s.id === targetSpaceId)
      if (!fromSpace || !targetSpace) {
        return { type: 'fail', logKey: 'log.placeFarmerFail' }
      }

      const allowed = computeAllowedPlacementSpaces(state, player)
      if (!allowed.some(a => a.spaceId === targetSpaceId)) {
        return { type: 'fail', logKey: 'log.placeFarmerFail' }
      }

      actionContext.jumpChain = [
        ...((actionContext.jumpChain as string[] | undefined) ?? []),
        sourceCard,
      ]

      removeWorkerRef(fromSpace, player.id, workerId)
      addWorkerRef(targetSpace, player.id, workerId)
      recordRoundPlacement(player, targetSpace.id, workerId)
      incPlacedFarmers(player)

      return {
        type: 'flow',
        flow: {
          type: 'leaf',
          actionId: targetSpaceId,
          sourceCard,
          actionContext: { ...actionContext },
        },
      }
    }

    if (actionContext?.fromSupply) {
      const supply = (player.workers ?? []).find((w) => !w.isActive)
      if (!supply) return { type: 'fail', logKey: 'log.placeFarmerFail' }
      supply.isActive = true
    }
    const allowed = computeAllowedPlacementSpaces(state, player)
    if (allowed.length === 0) return { type: 'fail', logKey: 'log.placeFarmerFail' }
    const options = allowed.map((a) => {
      const space = state.actionSpaces.find((s) => s.id === a.spaceId)!
      return {
        value: a.allowOccupied ? `${OCCUPIED_SPACE_CHOICE_PREFIX}${a.spaceId}` : a.spaceId,
        labelKey: space.nameKey,
      }
    })
    return {
      type: 'choice',
      promptKey: 'ui.interactionPlaceFarmerExtra',
      options,
    }
  },
  resolveChoice: ({ state, player }, choice) => {
    const allowOccupied = choice.startsWith(OCCUPIED_SPACE_CHOICE_PREFIX)
    const targetSpaceId = allowOccupied
      ? choice.slice(OCCUPIED_SPACE_CHOICE_PREFIX.length)
      : choice
    const targetSpace = state.actionSpaces.find((s) => s.id === targetSpaceId)
    if (!targetSpace) return { type: 'fail', logKey: 'log.placeFarmerFail' }
    const placeResult = placeFarmer(state, player, targetSpace)
    if (placeResult.type === 'fail') return placeResult
    const execResult = targetSpace.execute({ state, player, space: targetSpace })
    if (execResult.type === 'flow') return execResult
    return execResult
  },
}
