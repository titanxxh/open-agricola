import type {
  ActionDefinition,
  ActionExecutionResult,
  ActionFlow,
  ActionSpace,
  GameState,
  PlayerState,
} from '../../game/types'
import { recordRoundPlacement } from '../../cards/helpers/round-placement'
import { addWorkerRef, removeWorkerRef } from '../../game/space'
import { smallestAvailableWorker } from '../../game/player'
import { incPlacedFarmers } from '../../logic/stats'
import { computeAllowedPlacementSpaces } from '../helpers/placement-availability'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../helpers/placement-constants'
import { executeCardListener, getMatchingListeners } from '../../cards/card-listeners'
import { writeCardExtraData } from '../../cards/helpers/card-state'

export { OCCUPIED_SPACE_CHOICE_PREFIX } from '../helpers/placement-constants'

/**
 * Low-level helper: place a worker belonging to `player` onto `space`.
 *
 * Picks the smallest-id worker currently at home via `smallestAvailableWorker`.
 * This helper does NOT guard against already-occupied spaces — callers that
 * respect the "space free" rule must check `isSpaceOccupied(space)` first.
 * (canUseOccupied paths bypass that check intentionally.)
 */
const placeFarmer = (
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
      if (!sourceCard || !targetSpaceId) {
        return { type: 'fail', logKey: 'log.placeFarmerFail' }
      }

      // worker-less mode: A151-style "use this action space" trigger during
      // return-home phase, where there is no farmer in hand to relocate.
      const isWorkerless = !workerId

      let fromSpace: ActionSpace | undefined
      if (!isWorkerless) {
        fromSpace = state.actionSpaces.find(s =>
          s.takenBy.some(t => t.playerId === player.id && t.workerId === workerId),
        )
        if (!fromSpace) {
          return { type: 'fail', logKey: 'log.placeFarmerFail' }
        }
      }
      const targetSpace = state.actionSpaces.find(s => s.id === targetSpaceId)
      if (!targetSpace) {
        return { type: 'fail', logKey: 'log.placeFarmerFail' }
      }

      // Reachability check only applies to worker mode (worker-less is invoked
      // by cards that have already verified the space is unoccupied / valid).
      if (!isWorkerless) {
        const allowed = computeAllowedPlacementSpaces(state, player)
        if (!allowed.some(a => a.spaceId === targetSpaceId)) {
          return { type: 'fail', logKey: 'log.placeFarmerFail' }
        }
      }

      actionContext.jumpChain = [
        ...((actionContext.jumpChain as string[] | undefined) ?? []),
        sourceCard,
      ]

      if (!isWorkerless && fromSpace) {
        removeWorkerRef(fromSpace, player.id, workerId!)
        addWorkerRef(targetSpace, player.id, workerId!)
        recordRoundPlacement(player, targetSpace.id, workerId!)
        incPlacedFarmers(player)
      }

      // Cascade place-farmer after hooks for the second placement.
      // game-core's runPlaceFarmerAfterHooks (game-core.ts:1629) is one-shot
      // per top-level takeAction (only when isActionEngine). Once we hand the
      // second placement off via expandFlow, engineSource flips to 'flow' and
      // game-core won't dispatch place-farmer 'after' again. So we replicate
      // the same dispatch here, keyed on the jump destination, so that
      // third-party cards' place-farmer 'after' listeners (Y option) can fire
      // and even chain another jump (A->B->C). jumpChain on actionContext is
      // already accumulated above, so a card's self-check
      // chain.includes(thisCardId) terminates A->B->A loops.
      const cascadeListenerContext = {
        state,
        player,
        space: targetSpace,
        actionId: 'place-farmer',
        phase: 'after' as const,
        result: { type: 'ok' as const },
        actionContext,
      }
      const matchedCascade = getMatchingListeners(cascadeListenerContext)
      const cascadeFlows: ActionFlow[] = []
      for (const entry of matchedCascade) {
        const lresult = executeCardListener(entry.registration, cascadeListenerContext, {
          ownerPlayerId: entry.ownerPlayerId,
        })
        if (lresult?.flow) {
          cascadeFlows.push(lresult.flow)
        }
      }

      // Hand the second placement to the engine via a leaf with `expandFlow`.
      // When the target action defines an inner flow, the engine's
      // buildFlowNode expands it into the action's flow subtree (with
      // sourceCard + actionContext merged into every inner leaf). When the
      // target has no inner flow (grain-seeds / day-laborer / traveling-players),
      // the engine falls back to the standard ActionNode path. This mirrors
      // the `createEngine(actionId)` semantics used when the player triggers
      // the action directly via takeAction.
      const targetLeaf: ActionFlow = {
        type: 'leaf',
        actionId: targetSpaceId,
        expandFlow: true,
        sourceCard,
        actionContext: { ...actionContext },
      }
      if (cascadeFlows.length === 0) {
        return { type: 'flow', flow: targetLeaf }
      }
      return {
        type: 'flow',
        flow: {
          type: 'seq',
          children: [targetLeaf, ...cascadeFlows],
        },
      }
    }

    if (actionContext?.fromSupply) {
      const supply = (player.workers ?? []).find((w) => !w.isActive)
      if (!supply) return { type: 'fail', logKey: 'log.placeFarmerFail' }
      supply.isActive = true
    }
    let allowed = computeAllowedPlacementSpaces(state, player)
    // BGA `constraints` (e.g. C125 Nightworker restricts to building-resource
    // accumulation spaces of types the player has 0 of). Caller passes a
    // string[] of space ids via `actionContext.constraints`; we intersect it
    // with the engine-computed allowed set.
    const constraints = actionContext?.constraints as string[] | undefined
    if (Array.isArray(constraints) && constraints.length > 0) {
      const allowSet = new Set(constraints)
      allowed = allowed.filter((a) => allowSet.has(a.spaceId))
    }
    if (allowed.length === 0) return { type: 'fail', logKey: 'log.placeFarmerFail' }
    const options = allowed.map((a) => {
      const space = state.actionSpaces.find((s) => s.id === a.spaceId)!
      return {
        value: a.allowOccupied ? `${OCCUPIED_SPACE_CHOICE_PREFIX}${a.spaceId}` : a.spaceId,
        labelKey: space.nameKey,
      }
    })
    return {
      type: 'request',
      request: { kind: 'choice', options },
      promptKey: 'ui.interactionPlaceFarmerExtra',
    }
  },
  resolveChoice: ({ state, player, sourceCard, actionContext }, choice) => {
    const allowOccupied = choice.startsWith(OCCUPIED_SPACE_CHOICE_PREFIX)
    const targetSpaceId = allowOccupied
      ? choice.slice(OCCUPIED_SPACE_CHOICE_PREFIX.length)
      : choice
    const targetSpace = state.actionSpaces.find((s) => s.id === targetSpaceId)
    if (!targetSpace) return { type: 'fail', logKey: 'log.placeFarmerFail' }
    const placeResult = placeFarmer(state, player, targetSpace)
    if (placeResult.type === 'fail') return placeResult
    // B22 WalkingBoots-style fromSupply + markForRemoval pattern: when a
    // card pushes a temporary worker from supply and wants to retract it on
    // the next return-home, record the chosen space id on the source card's
    // extraData so the card's own onReturnHome listener can find the worker
    // it placed (cardStates.<sourceCard>.extraData.markedSpaceId).
    if (
      sourceCard &&
      actionContext?.fromSupply &&
      actionContext?.markForRemoval
    ) {
      writeCardExtraData(player, sourceCard, 'markedSpaceId', targetSpaceId)
    }
    const execResult = targetSpace.execute({ state, player, space: targetSpace })
    if (execResult.type === 'flow') return execResult
    return execResult
  },
}
