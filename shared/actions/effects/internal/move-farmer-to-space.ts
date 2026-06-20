import type { ActionDefinition, ActionFlow, ActionSpace } from '../../../contract/types'
import {
  addLinkedSpaceBlocks,
  addWorkerRef,
  clearLinkedSpaceBlocksForWorker,
  removeWorkerRef,
} from '../../../domain/space'
import { computeAllowedPlacementSpaces, type AllowedPlacement } from '../../helpers/placement-availability'

/**
 * Move a farmer from a source action space to another selectable action space and execute it.
 * Used by D51_Archway (move from Archway) and E10_StrawHat (move from Farmland).
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

export const moveFarmerToSpaceAction: ActionDefinition = {
  id: 'move-farmer-to-space',
  nameKey: 'actions.move-farmer-to-space.name',
  descriptionKey: 'actions.move-farmer-to-space.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, params, sourceCard, actionContext }) => {
    const excludeId = params?.excludeSpaceId as string | undefined
    const allowed = computeAllowedPlacementSpaces(state, player, { sourceCard, actionContext })
    const spaces = state.actionSpaces.filter((s) => isSelectableSpace(s, excludeId, allowed))
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
    const targetSpace = state.actionSpaces.find((s) => s.id === choice)
    if (!targetSpace) return { type: 'fail', errorKey: 'log.actionFail' }
    const excludeId = params?.excludeSpaceId as string | undefined
    const allowed = computeAllowedPlacementSpaces(state, player, { sourceCard, actionContext })
    if (!isSelectableSpace(targetSpace, excludeId, allowed)) {
      return { type: 'fail', errorKey: 'log.actionFail' }
    }

    const sourceSpace = (excludeId
      ? state.actionSpaces.find((s) => s.id === excludeId)
      : space.takenBy.some((worker) => worker.playerId === player.id)
        ? space
        : state.actionSpaces.find((s) => s.takenBy.some((worker) => worker.playerId === player.id)))
    if (!sourceSpace) return { type: 'fail', errorKey: 'log.actionFail' }
    const movedWorker = removeWorkerRef(sourceSpace, player.id)
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
    const flow: ActionFlow = {
      type: 'leaf',
      actionId: targetSpace.id,
      expandFlow: true,
      sourceCard,
      actionContext: targetActionContext,
    }
    return {
      type: 'flow',
      flow,
      extraData: { actionContextWrite: { targetSpaceId: targetSpace.id } },
    }
  },
}
