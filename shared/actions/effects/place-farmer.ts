import type { PersonUseReceipt } from '../../contract/person-use'
import type {
  ActionChoiceOption,
  ActionDefinition,
  ActionExecutionResult,
  ActionFlow,
  ActionSpace,
  GameState,
  PlayerState,
} from '../../contract/types'
import { resetComputeReplaceGuards } from '../../engine/replace-guard'
import { recordRoundPlacement } from '../../cards/helpers/round-placement'
import { writeActionSnapshotExtraData } from '../../cards/helpers/action-snapshot'
import {
  addLinkedSpaceBlocks,
  addWorkerRef,
  clearLinkedSpaceBlocksForWorker,
  findActionSpaceById,
  findActionSpaceByWorker,
  removeWorkerRef,
} from '../../domain/space'
import { smallestAvailableWorker } from '../../domain/player'
import { selectWorkerForMoorAction } from '../../moor/heating'
import { findSupplyWorker } from '../../domain/supply-workers'
import type { SupplyWorkerSource } from '../../contract/types'
import { incPlacedFarmers } from '../../session/stats'
import type { ActionHookRegistry } from '../hooks'
import { computeAllowedPlacementSpaces } from '../helpers/placement-availability'
import { missingBuildingResourceSpaceIds } from '../helpers/missing-building-resource-spaces'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../helpers/placement-constants'
import { collectBeforeActionSpaceUseFlows } from '../../cards/card-listeners'
import { recordActionSpaceUse } from '../../domain/action-space-use'

export { OCCUPIED_SPACE_CHOICE_PREFIX } from '../helpers/placement-constants'

/**
 * Low-level helper: place a worker belonging to `player` onto `space`.
 *
 * Picks the smallest-id worker currently at home via `smallestAvailableWorker`.
 * This helper does NOT guard against already-occupied spaces — callers that
 * respect the "space free" rule must check `isSpaceOccupied(space)` first.
 * (canUseOccupied paths bypass that check intentionally.)
 */
const usesLiveBuildingResourceConstraints = (
  actionContext: Record<string, unknown> | undefined,
): boolean => actionContext?.constraintsMode === 'missing-building-resource'

const constrainPlacements = <T extends { spaceId: string }>(
  allowed: T[],
  state: GameState,
  player: PlayerState,
  actionContext: Record<string, unknown> | undefined,
): T[] => {
  if (usesLiveBuildingResourceConstraints(actionContext)) {
    const allowSet = new Set(missingBuildingResourceSpaceIds(state, player))
    return allowed.filter((placement) => allowSet.has(placement.spaceId))
  }
  const constraints = actionContext?.constraints
  if (!Array.isArray(constraints) || constraints.length === 0) return allowed
  const allowSet = new Set(constraints.filter((id): id is string => typeof id === 'string'))
  return allowed.filter((placement) => allowSet.has(placement.spaceId))
}

const legalPlacements = (
  state: GameState,
  player: PlayerState,
  actionHooks: ActionHookRegistry | undefined,
  sourceCard: string | undefined,
  actionContext: Record<string, unknown> | undefined,
) => {
  const temporarySupplyWorker = readTemporarySupplyWorker(player, actionContext, sourceCard)
  return constrainPlacements(computeAllowedPlacementSpaces(state, player, {
    actionHooks,
    sourceCard,
    actionContext,
    ignoreWorkerAvailability: temporarySupplyWorker !== undefined,
  }), state, player, actionContext)
}

const placementOptions = (
  state: GameState,
  allowed: { spaceId: string; allowOccupied: boolean; option?: ActionChoiceOption }[],
): ActionChoiceOption[] => allowed.map((placement) => {
  const space = findActionSpaceById(state, placement.spaceId)!
  return {
    value: placement.allowOccupied ? `${OCCUPIED_SPACE_CHOICE_PREFIX}${placement.spaceId}` : placement.spaceId,
    labelKey: placement.option?.labelKey ?? space.nameKey,
    labelParams: placement.option?.labelParams,
    sourceCard: placement.option?.sourceCard,
    effectPreview: placement.option?.effectPreview,
    descriptionPreview: placement.option?.descriptionPreview,
    disabled: placement.option?.disabled,
    disabledReasonKey: placement.option?.disabledReasonKey,
  }
})

const placeFarmer = (
  state: GameState,
  player: PlayerState,
  space: ActionSpace,
): ActionExecutionResult & { workerId?: string; personUse?: PersonUseReceipt } => {
  const worker = selectWorkerForMoorAction(state, player, space.id)
  if (!worker) {
    return { type: 'fail', errorKey: 'log.placeFarmerFail' }
  }
  addWorkerRef(space, player.id, worker.id)
  addLinkedSpaceBlocks(state, space, player.id, worker.id)
  const personUse = recordRoundPlacement(player, space.id, worker.id)
  return { type: 'ok', workerId: worker.id, personUse }
}

const readSupplySource = (
  context: Record<string, unknown> | undefined,
): SupplyWorkerSource | undefined => {
  const source = context?.workerSource
  if (!source || typeof source !== 'object' || !('kind' in source) || source.kind !== 'supply') return
  if (!('disposition' in source) || (
    source.disposition !== 'return-to-supply' && source.disposition !== 'remove-from-game'
  )) return
  if ('workerId' in source && typeof source.workerId !== 'string') return
  return source as SupplyWorkerSource
}

const readTemporarySupplyWorker = (
  player: PlayerState,
  context: Record<string, unknown> | undefined,
  sourceCard?: string,
) => {
  const source = readSupplySource(context)
  if (!source) return
  const workerId = typeof context?.supplyWorkerId === 'string' ? context.supplyWorkerId : source.workerId
  return findSupplyWorker(player, sourceCard, workerId)
}

const placeTemporarySupplyWorker = (
  state: GameState,
  player: PlayerState,
  space: ActionSpace,
  workerId: string,
): ActionExecutionResult & { workerId?: string; personUse?: PersonUseReceipt } => {
  const alreadyPlaced = findActionSpaceByWorker(state, player.id, workerId) !== undefined
  if (alreadyPlaced) return { type: 'fail', errorKey: 'log.placeFarmerFail' }
  addWorkerRef(space, player.id, workerId)
  addLinkedSpaceBlocks(state, space, player.id, workerId)
  const personUse = recordRoundPlacement(player, space.id, workerId)
  return { type: 'ok', workerId, personUse }
}

export const placeFarmerAction: ActionDefinition = {
  id: 'place-farmer',
  nameKey: 'actions.place-farmer.name',
  descriptionKey: 'actions.place-farmer.description',
  roundAvailable: 1,
  gainPerRound: {},
  projectInteractionRequest: (state, player, request, actionContext, actionHooks, sourceCard) => {
    if (!usesLiveBuildingResourceConstraints(actionContext) || request.kind !== 'choice' || !actionHooks) return request
    const options = placementOptions(state, legalPlacements(state, player, actionHooks, sourceCard, actionContext))
    const unchanged = options.length === request.options.length && options.every((option, index) => {
      const current = request.options[index]
      return option.value === current?.value
        && option.labelKey === current?.labelKey
        && option.disabled === current?.disabled
        && option.disabledReasonKey === current?.disabledReasonKey
        && option.sourceCard === current?.sourceCard
    })
    return unchanged ? request : { ...request, options }
  },
  canBeExecutedByPlayer: (state, player, context) =>
    context?.actionContext?.viaCardJump === true
      ? context.actionContext.workerId === undefined || (
        typeof context.actionContext.workerId === 'string'
        && findActionSpaceByWorker(state, player.id, context.actionContext.workerId) !== undefined
      )
      : context?.actionContext?.workerSource !== undefined
      ? readTemporarySupplyWorker(player, context.actionContext, context.sourceCard) !== undefined
      : smallestAvailableWorker(state, player) !== null,
  previewEffect: ({ state, actionContext }) => {
    const constraints = actionContext?.constraints
    const fixedTarget = Array.isArray(constraints) && constraints.length === 1 && typeof constraints[0] === 'string'
      ? constraints[0] : undefined
    const target = state.actionSpaces.find((space) => space.id === (actionContext?.targetSpaceId ?? fixedTarget))
    return target ? { kind: 'actionSpace', spaceId: target.id, nameKey: target.nameKey } : undefined
  },
  execute: ({ actionHooks, state, player, sourceCard, actionContext, eventSink, completedTransactionEvents }) => {
    // viaCardJump branch (Sprint 5 mech-A): move farmer + return flow leaf so
    // the engine runs the second placement through the standard ActionNode path.
    if (actionContext?.viaCardJump) {
      const sourceCard = actionContext.sourceCard as string | undefined
      const workerId = actionContext.workerId as string | undefined
      const targetSpaceId = actionContext.targetSpaceId as string | undefined
      if (!sourceCard || !targetSpaceId) {
        return { type: 'fail', errorKey: 'log.placeFarmerFail' }
      }

      // worker-less mode: A151-style "use this action space" trigger during
      // return-home phase, where there is no farmer in hand to relocate.
      const isWorkerless = !workerId

      let fromSpace: ActionSpace | undefined
      if (!isWorkerless) {
        fromSpace = findActionSpaceByWorker(state, player.id, workerId)
        if (!fromSpace) {
          return { type: 'fail', errorKey: 'log.placeFarmerFail' }
        }
      }
      const targetSpace = findActionSpaceById(state, targetSpaceId)
      if (!targetSpace) {
        return { type: 'fail', errorKey: 'log.placeFarmerFail' }
      }

      // Reachability check only applies to worker mode (worker-less is invoked
      // by cards that have already verified the space is unoccupied / valid).
      if (!isWorkerless) {
        const allowed = computeAllowedPlacementSpaces(state, player, { actionHooks, actionSpaceUse: { newPlacement: false }, sourceCard, actionContext, ignoreWorkerAvailability: true })
        if (!allowed.some(a => a.spaceId === targetSpaceId)) {
          return { type: 'fail', errorKey: 'log.placeFarmerFail' }
        }
      }

      actionContext.jumpChain = [
        ...((actionContext.jumpChain as string[] | undefined) ?? []),
        sourceCard,
      ]

      if (!isWorkerless && fromSpace) {
        removeWorkerRef(fromSpace, player.id, workerId!)
        clearLinkedSpaceBlocksForWorker(state, player.id, workerId!)
        addWorkerRef(targetSpace, player.id, workerId!)
        addLinkedSpaceBlocks(state, targetSpace, player.id, workerId!)
        recordRoundPlacement(player, targetSpace.id, workerId!, true)
        incPlacedFarmers(player)
        eventSink?.emit<'worker.placed'>({
          type: 'worker.placed',
          workerId: workerId!,
          spaceId: targetSpaceId,
          viaCardId: sourceCard,
        })
      }

      // Hand the second placement to the engine via a leaf with `expandFlow`.
      // When the target action defines an inner flow, the engine's
      // buildFlowNode expands it into the action's flow subtree (with
      // sourceCard + actionContext merged into every inner leaf). When the
      // target has no inner flow (grain-seeds / day-laborer / traveling-players),
      // the engine falls back to the standard ActionNode path. This mirrors
      // the `createEngine(actionId)` semantics used when the player triggers
      // the action directly via takeAction.
      const use = recordActionSpaceUse({ state, player, space: targetSpace, eventSink, sourceCard, completedTransactionEvents }, { newPlacement: false })
      const targetLeaf: ActionFlow = {
        type: 'leaf',
        actionId: targetSpaceId,
        spaceUse: use,
        expandFlow: true,
        sourceCard,
        actionContext: resetComputeReplaceGuards(actionContext),
      }
      const beforeFlows = collectBeforeActionSpaceUseFlows(actionHooks, state, player, targetSpace, use, resetComputeReplaceGuards(actionContext))
      if (beforeFlows.length > 0) {
        return {
          type: 'flow',
          flow: {
            type: 'seq',
            children: [...beforeFlows, targetLeaf],
          },
        }
      }
      return { type: 'flow', flow: targetLeaf }
    }

    const temporarySupplyWorker = readTemporarySupplyWorker(player, actionContext, sourceCard)
    if (actionContext?.workerSource !== undefined) {
      const source = readSupplySource(actionContext)
      if (!source || !temporarySupplyWorker) return { type: 'fail', errorKey: 'log.placeFarmerFail' }
      actionContext.supplyWorkerId = temporarySupplyWorker.id
      temporarySupplyWorker.supplyUse = {
        sourceCard,
        disposition: source.disposition,
        status: 'pending',
        returnRound: state.round,
      }
    }
    const allowed = legalPlacements(state, player, actionHooks, sourceCard, actionContext)
    if (allowed.length === 0) return { type: 'fail', errorKey: 'log.placeFarmerFail' }
    const options = placementOptions(state, allowed)
    return {
      type: 'request',
      request: { kind: 'choice', options },
      promptKey: 'ui.interactionPlaceFarmerExtra',
    }
  },
  resolveChoice: ({ actionHooks, state, player, sourceCard, actionContext, eventSink, completedTransactionEvents }, choice) => {
    const allowOccupied = choice.startsWith(OCCUPIED_SPACE_CHOICE_PREFIX)
    const targetSpaceId = allowOccupied
      ? choice.slice(OCCUPIED_SPACE_CHOICE_PREFIX.length)
      : choice
    const targetSpace = findActionSpaceById(state, targetSpaceId)
    if (!targetSpace) return { type: 'fail', errorKey: 'log.placeFarmerFail' }

    const temporarySupplyWorker = readTemporarySupplyWorker(player, actionContext, sourceCard)
    if (actionContext?.workerSource !== undefined && !temporarySupplyWorker) {
      return { type: 'fail', errorKey: 'log.placeFarmerFail' }
    }
    const allowed = legalPlacements(state, player, actionHooks, sourceCard, actionContext)
    const allowedPlacement = allowed.find((placement) => placement.spaceId === targetSpaceId)
    if (!allowedPlacement || allowedPlacement.allowOccupied !== allowOccupied) {
      return { type: 'fail', errorKey: 'log.placeFarmerFail' }
    }

    const placeResult = temporarySupplyWorker
      ? placeTemporarySupplyWorker(state, player, targetSpace, temporarySupplyWorker.id)
      : placeFarmer(state, player, targetSpace)
    if (placeResult.type === 'fail') return placeResult
    incPlacedFarmers(player)
    writeActionSnapshotExtraData(player, 'placedWorkerId', placeResult.workerId)
    if (temporarySupplyWorker?.supplyUse) temporarySupplyWorker.supplyUse.status = 'temporary'
    eventSink?.emit<'worker.placed'>({
      type: 'worker.placed',
      workerId: placeResult.workerId!,
      spaceId: targetSpaceId,
      ...(sourceCard ? { viaCardId: sourceCard } : {}),
    })
    const actionContextWrite = {
      targetSpaceId,
      placedWorkerId: placeResult.workerId,
    }
    const targetActionContext = { ...resetComputeReplaceGuards(actionContext), ...actionContextWrite, ...(temporarySupplyWorker ? { trueAction: true } : {}) }
    if (actionContext) {
      actionContext.targetSpaceId = targetSpaceId
      actionContext.placedWorkerId = placeResult.workerId
    }
    const use = recordActionSpaceUse({ state, player, space: targetSpace, eventSink, sourceCard, completedTransactionEvents }, { newPlacement: true, personUse: placeResult.personUse })
    const targetLeaf: ActionFlow = {
      type: 'leaf',
      actionId: targetSpaceId,
      spaceUse: use,
      expandFlow: true,
      sourceCard,
      actionContext: targetActionContext,
    }
    const beforeFlows = collectBeforeActionSpaceUseFlows(actionHooks, state, player, targetSpace, use, targetActionContext)
    if (beforeFlows.length > 0) {
      return {
        type: 'flow',
        flow: {
          type: 'seq',
          children: [...beforeFlows, targetLeaf],
        },
        personUse: placeResult.personUse,
        extraData: { actionContextWrite },
      }
    }
    return {
      type: 'flow',
      flow: targetLeaf,
      personUse: placeResult.personUse,
      extraData: { actionContextWrite },
    }
  },
}
