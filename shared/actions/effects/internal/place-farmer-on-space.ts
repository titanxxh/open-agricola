import type { ActionDefinition, ActionFlow, ActionSpace, GameState, PlayerState } from '../../../contract/types'
import { recordRoundPlacement } from '../../../cards/helpers/round-placement'
import { executeCardListener, getMatchingListeners, listenerOwnerOptions } from '../../../cards/card-listeners'
import { addLinkedSpaceBlocks, addWorkerRef, isSpaceBlocked, isSpaceOccupied } from '../../../domain/space'
import { smallestAvailableWorker, workersAvailable } from '../../../domain/player'
import { incPlacedFarmers } from '../../../session/stats'
import { canEnterSpace } from '../../helpers/placement-availability'

const collectBeforePlacementFlows = (
  state: GameState,
  player: PlayerState,
  targetSpace: ActionSpace,
  actionContext: Record<string, unknown> | undefined,
): ActionFlow[] => {
  const context = {
    state,
    player,
    space: targetSpace,
    actionId: targetSpace.id,
    phase: 'before' as const,
    actionContext,
  }
  const flows: ActionFlow[] = []
  for (const entry of getMatchingListeners(context)) {
    const result = executeCardListener(entry.registration, context, listenerOwnerOptions(entry))
    if (result?.flow) flows.push(result.flow)
  }
  return flows
}

const collectAfterPlacementFlows = (
  state: GameState,
  player: PlayerState,
  targetSpace: ActionSpace,
  actionContext: Record<string, unknown> | undefined,
): ActionFlow[] => {
  const context = {
    state,
    player,
    space: targetSpace,
    actionId: 'place-farmer',
    phase: 'after' as const,
    result: { type: 'ok' as const },
    actionContext,
  }
  const flows: ActionFlow[] = []
  for (const entry of getMatchingListeners(context)) {
    const result = executeCardListener(entry.registration, context, listenerOwnerOptions(entry))
    if (result?.flow) flows.push(result.flow)
  }
  return flows
}

const canTargetSpace = (
  state: GameState,
  player: PlayerState,
  space: ActionSpace,
  allowOccupied: boolean,
): boolean => {
  if (!canEnterSpace(space, player, state)) return false
  if (isSpaceBlocked(space)) return false
  if (!allowOccupied && isSpaceOccupied(space)) return false
  return space.canBeExecutedByPlayer(state, player)
}

export const placeFarmerOnSpaceAction: ActionDefinition = {
  id: 'place-farmer-on-space',
  nameKey: 'actions.place-farmer.name',
  descriptionKey: 'actions.place-farmer.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player) => workersAvailable(state, player) > 0,
  execute: ({ state, player, params, sourceCard, actionContext, eventSink }) => {
    const targetSpaceId = typeof params?.spaceId === 'string' ? params.spaceId : undefined
    if (!targetSpaceId) return { type: 'fail', errorKey: 'log.placeFarmerFail' }
    const targetSpace = state.actionSpaces.find((space) => space.id === targetSpaceId)
    if (!targetSpace) return { type: 'fail', errorKey: 'log.placeFarmerFail' }

    const allowOccupied = params?.allowOccupied === true
    if (!canTargetSpace(state, player, targetSpace, allowOccupied)) {
      return { type: 'fail', errorKey: 'log.placeFarmerFail' }
    }

    const worker = smallestAvailableWorker(state, player)
    if (!worker) return { type: 'fail', errorKey: 'log.placeFarmerFail' }

    addWorkerRef(targetSpace, player.id, worker.id)
    addLinkedSpaceBlocks(state, targetSpace, player.id, worker.id)
    recordRoundPlacement(player, targetSpace.id, worker.id)
    incPlacedFarmers(player)

    const cardId = typeof params?.sourceCard === 'string' ? params.sourceCard : sourceCard
    eventSink?.emit<'worker.placed'>({
      type: 'worker.placed',
      workerId: worker.id,
      spaceId: targetSpace.id,
      ...(cardId ? { viaCardId: cardId } : {}),
    })

    const actionContextWrite = {
      targetSpaceId: targetSpace.id,
      placedWorkerId: worker.id,
    }
    const targetActionContext = { ...(actionContext ?? {}), ...actionContextWrite }
    if (actionContext) {
      actionContext.targetSpaceId = targetSpace.id
      actionContext.placedWorkerId = worker.id
    }
    if (params?.executeTarget === false) {
      return { type: 'ok', extraData: { actionContextWrite } }
    }

    const targetLeaf: ActionFlow = {
      type: 'leaf',
      actionId: targetSpace.id,
      expandFlow: true,
      sourceCard: cardId,
      actionContext: targetActionContext,
    }
    const beforeFlows = collectBeforePlacementFlows(state, player, targetSpace, targetActionContext)
    const afterFlows = collectAfterPlacementFlows(state, player, targetSpace, targetActionContext)
    if (beforeFlows.length === 0 && afterFlows.length === 0) {
      return { type: 'flow', flow: targetLeaf, extraData: { actionContextWrite } }
    }
    return {
      type: 'flow',
      flow: {
        type: 'seq',
        children: [...beforeFlows, targetLeaf, ...afterFlows],
      },
      extraData: { actionContextWrite },
    }
  },
}
