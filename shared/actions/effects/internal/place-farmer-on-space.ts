import type { ActionDefinition, ActionFlow } from '../../../contract/types'
import { recordRoundPlacement } from '../../../cards/helpers/round-placement'
import { collectBeforePlacementFlows } from '../../../cards/card-listeners'
import { addLinkedSpaceBlocks, addWorkerRef, findActionSpaceById } from '../../../domain/space'
import { workersAvailable } from '../../../domain/player'
import { selectWorkerForMoorAction } from '../../../moor/heating'
import { incPlacedFarmers } from '../../../session/stats'
import { canPlaceWorkerOnSpace } from '../../helpers/placement-availability'

export const placeFarmerOnSpaceAction: ActionDefinition = {
  id: 'place-farmer-on-space',
  nameKey: 'actions.place-farmer.name',
  descriptionKey: 'actions.place-farmer.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player) => workersAvailable(state, player) > 0,
  execute: ({ actionHooks, state, player, params, sourceCard, actionContext, eventSink }) => {
    const targetSpaceId = typeof params?.spaceId === 'string' ? params.spaceId : undefined
    if (!targetSpaceId) return { type: 'fail', errorKey: 'log.placeFarmerFail' }
    const targetSpace = findActionSpaceById(state, targetSpaceId)
    if (!targetSpace) return { type: 'fail', errorKey: 'log.placeFarmerFail' }

    const allowOccupied = params?.allowOccupied === true
    if (!canPlaceWorkerOnSpace(state, player, targetSpace, { actionHooks, allowOccupied })) {
      return { type: 'fail', errorKey: 'log.placeFarmerFail' }
    }

    const worker = selectWorkerForMoorAction(state, player, targetSpace.id)
    if (!worker) return { type: 'fail', errorKey: 'log.placeFarmerFail' }

    addWorkerRef(targetSpace, player.id, worker.id)
    addLinkedSpaceBlocks(state, targetSpace, player.id, worker.id)
    const personUse = recordRoundPlacement(player, targetSpace.id, worker.id)
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
      spaceUse: { newPlacement: true, personUse, completePlacement: true },
      expandFlow: true,
      sourceCard: cardId,
      actionContext: targetActionContext,
    }
    const beforeFlows = collectBeforePlacementFlows(actionHooks, state, player, targetSpace, targetActionContext)
    if (beforeFlows.length === 0) {
      return { type: 'flow', flow: targetLeaf, extraData: { actionContextWrite } }
    }
    return {
      type: 'flow',
      flow: {
        type: 'seq',
        children: [...beforeFlows, targetLeaf],
      },
      extraData: { actionContextWrite },
    }
  },
}
