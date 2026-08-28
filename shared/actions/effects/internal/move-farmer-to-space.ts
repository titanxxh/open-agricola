import type { ActionDefinition, ActionFlow, ActionSpace, GameState, PlayerState } from '../../../contract/types'
import {
  addLinkedSpaceBlocks,
  addWorkerRef,
  clearLinkedSpaceBlocksForWorker,
  filterActionSpacesByIds,
  findActionSpaceById,
  findActionSpaceByWorker,
  removeWorkerRef,
} from '../../../domain/space'
import { computeAllowedPlacementSpaces, type AllowedPlacement } from '../../helpers/placement-availability'

/**
 * Move a farmer from a source action space to another selectable action space and execute it.
 * Used by D051_Archway (move from Archway) and E010_StrawHat (move from Farmland).
 *
 * - execute(): lists selectable spaces (excluding params.excludeSpaceId) → returns choice
 * - resolveChoice(): marks target space as takenBy, executes the space's action
 */
const isSelectableSpace = (
  space: ActionSpace,
  excludeId: string | undefined,
  allowed: AllowedPlacement[],
): boolean => {
  if (space.id === excludeId) return false
  return allowed.some((a) => a.spaceId === space.id)
}

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

const findMoveSource = (
  state: GameState,
  player: PlayerState,
  currentSpace: ActionSpace | undefined,
  sourceSpaceId: string | undefined,
  workerId: string | undefined,
): ActionSpace | undefined => {
  const source = sourceSpaceId
    ? findActionSpaceById(state, sourceSpaceId)
    : currentSpace?.takenBy.some((worker) =>
      worker.playerId === player.id && (!workerId || worker.workerId === workerId)
    )
      ? currentSpace
      : findActionSpaceByWorker(state, player.id, workerId)
  return source?.takenBy.some((worker) =>
    worker.playerId === player.id && (!workerId || worker.workerId === workerId)
  ) ? source : undefined
}

const selectableSpaces = (
  state: GameState,
  player: PlayerState,
  sourceCard: string | undefined,
  actionContext: Record<string, unknown> | undefined,
  sourceSpaceId: string | undefined,
): ActionSpace[] => {
  const allowed = computeAllowedPlacementSpaces(state, player, {
    sourceCard,
    actionContext,
    ignoreWorkerAvailability: true,
  })
  return filterActionSpacesByIds(state, allowed.map((entry) => entry.spaceId))
    .filter((space) => isSelectableSpace(space, sourceSpaceId, allowed))
}

export const moveFarmerToSpaceAction: ActionDefinition = {
  id: 'move-farmer-to-space',
  nameKey: 'actions.move-farmer-to-space.name',
  descriptionKey: 'actions.move-farmer-to-space.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player, context) => {
    const actionContext = context?.actionContext
    const sourceSpaceId = readString(actionContext?.moveFarmerSourceSpaceId)
    const workerId = readString(actionContext?.moveFarmerWorkerId)
    if (!findMoveSource(state, player, undefined, sourceSpaceId, workerId)) return false
    return selectableSpaces(state, player, context?.sourceCard, actionContext, sourceSpaceId).length > 0
  },
  execute: ({ state, player, params, sourceCard, actionContext }) => {
    const sourceSpaceId = readString(actionContext?.moveFarmerSourceSpaceId)
      ?? readString(params?.excludeSpaceId)
    const workerId = readString(actionContext?.moveFarmerWorkerId)
      ?? readString(params?.workerId)
    if (!findMoveSource(state, player, undefined, sourceSpaceId, workerId)) {
      return { type: 'fail', errorKey: 'log.actionFail' }
    }
    const spaces = selectableSpaces(state, player, sourceCard, actionContext, sourceSpaceId)
    if (spaces.length === 0) return { type: 'fail', errorKey: 'log.actionFail' }
    return {
      type: 'request',
      request: {
        kind: 'choice',
        options: spaces.map((s) => ({ value: s.id, labelKey: s.nameKey })),
      },
      promptKey: 'ui.interactionMoveFarmerToSpace',
    }
  },
  resolveChoice: ({ state, player, space, params, sourceCard, actionContext, eventSink }, choice) => {
    const targetSpace = findActionSpaceById(state, choice)
    if (!targetSpace) return { type: 'fail', errorKey: 'log.actionFail' }
    const sourceSpaceId = readString(actionContext?.moveFarmerSourceSpaceId)
      ?? readString(params?.excludeSpaceId)
    const workerId = readString(actionContext?.moveFarmerWorkerId)
      ?? readString(params?.workerId)
    const allowed = computeAllowedPlacementSpaces(state, player, { sourceCard, actionContext, ignoreWorkerAvailability: true })
    if (!isSelectableSpace(targetSpace, sourceSpaceId, allowed)) {
      return { type: 'fail', errorKey: 'log.actionFail' }
    }

    const sourceSpace = findMoveSource(state, player, space, sourceSpaceId, workerId)
    if (!sourceSpace) return { type: 'fail', errorKey: 'log.actionFail' }
    const movedWorker = removeWorkerRef(sourceSpace, player.id, workerId)
    if (!movedWorker) return { type: 'fail', errorKey: 'log.actionFail' }
    clearLinkedSpaceBlocksForWorker(state, player.id, movedWorker.workerId)

    addWorkerRef(targetSpace, player.id, movedWorker.workerId)
    addLinkedSpaceBlocks(state, targetSpace, player.id, movedWorker.workerId)
    eventSink?.emit<'worker.placed'>({
      type: 'worker.placed',
      workerId: movedWorker.workerId,
      spaceId: targetSpace.id,
      ...(sourceCard ? { viaCardId: sourceCard } : {}),
    })

    const targetActionContext = { ...(actionContext ?? {}), targetSpaceId: targetSpace.id }
    if (actionContext) actionContext.targetSpaceId = targetSpace.id
    const targetFlow: ActionFlow = {
      type: 'leaf',
      actionId: targetSpace.id,
      expandFlow: true,
      sourceCard,
      actionContext: targetActionContext,
    }
    return {
      type: 'flow',
      flow: {
        type: 'seq',
        children: [
          { type: 'leaf', actionId: 'turn-scope', params: { operation: 'begin' } },
          targetFlow,
          { type: 'leaf', actionId: 'turn-scope', params: { operation: 'end' } },
        ],
      },
      extraData: { actionContextWrite: { targetSpaceId: targetSpace.id } },
    }
  },
}
