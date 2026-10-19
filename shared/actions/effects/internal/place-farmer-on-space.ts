import type { PersonUseReceipt } from '../../../contract/person-use'
import type { ActionHookRegistry } from '../../hooks'
import type { ActionDefinition, ActionFlow, ActionSpace, GameState, PlayerState } from '../../../contract/types'
import { recordRoundPlacement } from '../../../cards/helpers/round-placement'
import { collectBeforePlacementFlows, getMatchingListeners, type MatchedCardListener } from '../../../cards/card-listeners'
import { addLinkedSpaceBlocks, addWorkerRef, findActionSpaceById, isSpaceBlocked, isSpaceOccupied } from '../../../domain/space'
import { smallestAvailableWorker, workersAvailable } from '../../../domain/player'
import { incPlacedFarmers } from '../../../session/stats'
import { canEnterSpace } from '../../helpers/placement-availability'
import { isPlacementActionDoableInFlowContext } from '../../flow'
import { getActionDefinition } from '../../action-definition-lookup'

const collectAfterPlacementFlows = (
  actionHooks: ActionHookRegistry | undefined,
  state: GameState,
  player: PlayerState,
  targetSpace: ActionSpace,
  actionContext: Record<string, unknown> | undefined,
  personUse: PersonUseReceipt,
): ActionFlow[] => {
  const context = {
    actionHooks,
    state,
    player,
    space: targetSpace,
    actionId: 'place-farmer',
    phase: 'after' as const,
    result: { type: 'ok' as const },
    actionContext,
  }
  return getMatchingListeners(context).map((entry) =>
    activatePlacementListenerFlow(entry, player.id, actionContext, personUse),
  )
}

const activatePlacementListenerFlow = (
  entry: MatchedCardListener,
  triggerPlayerId: string,
  actionContext: Record<string, unknown> | undefined,
  personUse: PersonUseReceipt,
): ActionFlow => ({
  type: 'leaf',
  actionId: 'activate-card',
  sourceCard: entry.cardId || undefined,
  params: {
    listenerId: entry.registration.id,
    cardId: entry.cardId,
    phase: 'after',
    actionId: 'place-farmer',
    event: { result: { type: 'ok', personUse } },
    ownerPlayerId: entry.ownerPlayerId,
    ownerCardZone: entry.ownerCardZone,
    triggerPlayerId,
    mandatory: entry.registration.mandatory === true,
  },
  actionContext: actionContext ? { ...actionContext } : undefined,
  targetPlayerId: entry.ownerPlayerId || undefined,
})

const canTargetSpace = (
  actionHooks: ActionHookRegistry | undefined,
  state: GameState,
  player: PlayerState,
  space: ActionSpace,
  allowOccupied: boolean,
): boolean => {
  if (!canEnterSpace(space, player, state)) return false
  if (isSpaceBlocked(space)) return false
  if (!allowOccupied && isSpaceOccupied(space)) return false
  if (!space.canBeExecutedByPlayer(state, player, { actionHooks })) return false
  return isPlacementActionDoableInFlowContext({
    actionHooks, state, player, space, action: space, actionId: space.id,
    resolveAction: actionId => findActionSpaceById(state, actionId) ?? getActionDefinition(actionId),
  })
}

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
    if (!canTargetSpace(actionHooks, state, player, targetSpace, allowOccupied)) {
      return { type: 'fail', errorKey: 'log.placeFarmerFail' }
    }

    const worker = smallestAvailableWorker(state, player)
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
      expandFlow: true,
      sourceCard: cardId,
      actionContext: targetActionContext,
    }
    const beforeFlows = collectBeforePlacementFlows(actionHooks, state, player, targetSpace, targetActionContext)
    const afterFlows = collectAfterPlacementFlows(actionHooks, state, player, targetSpace, targetActionContext, personUse)
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
