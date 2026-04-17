import type { ActionDefinition, ActionExecutionContext, ActionSpace } from '../../game/types'
import { applyCanUseOccupiedHooks } from '../hooks'
import {
  executeCardListener,
  getMatchingListeners,
  type CardListenerContext,
} from '../../cards/card-listeners'
import { addWorkerRef, isSpaceOccupied, spaceHasPlayer } from '../../game/space'
import { smallestAvailableWorker } from '../../game/player'

/**
 * Move a farmer from a source action space to another selectable action space and execute it.
 * Used by D51_Archway (move from Archway) and E10_StrawHat (move from Farmland).
 *
 * - execute(): lists selectable spaces (excluding params.excludeSpaceId) → returns choice
 * - resolveChoice(): marks target space as takenBy, executes the space's action
 */
const canUseOccupiedSpace = (
  context: ActionExecutionContext & { actionId: string },
) => {
  let canUseOccupied = applyCanUseOccupiedHooks(context, false)
  const listenerContext: CardListenerContext = {
    ...context,
    phase: 'canUseOccupied',
    canUseOccupied,
  }
  const matched = getMatchingListeners(listenerContext)
  for (const entry of matched) {
    const result = executeCardListener(entry.registration, listenerContext, {
      ownerPlayerId: entry.ownerPlayerId,
    })
    if (typeof result?.canUseOccupied === 'boolean') {
      canUseOccupied = result.canUseOccupied
    }
  }
  return canUseOccupied
}

const isSelectableSpace = (
  context: Omit<ActionExecutionContext, 'space'>,
  space: ActionSpace,
  excludeId?: string,
) => {
  if (space.id === excludeId) return false
  if (!space.canBeExecutedByPlayer(context.state, context.player)) return false
  if (!isSpaceOccupied(space)) return true
  return canUseOccupiedSpace({ ...context, space, actionId: space.id })
}

export const moveFarmerToSpaceAction: ActionDefinition = {
  id: 'move-farmer-to-space',
  nameKey: 'actions.move-farmer-to-space.name',
  descriptionKey: 'actions.move-farmer-to-space.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, params }) => {
    const excludeId = params?.excludeSpaceId as string | undefined
    const spaces = state.actionSpaces.filter(
      (space) => isSelectableSpace({ state, player, params }, space, excludeId),
    )
    if (spaces.length === 0) return { type: 'fail', logKey: 'log.actionFail' }
    return {
      type: 'choice',
      promptKey: 'ui.interactionMoveFarmerToSpace',
      options: spaces.map((s) => ({ value: s.id, labelKey: s.nameKey })),
    }
  },
  resolveChoice: ({ state, player }, choice) => {
    const targetSpace = state.actionSpaces.find((s) => s.id === choice)
    if (!targetSpace) return { type: 'fail', logKey: 'log.actionFail' }
    // Move farmer to target space (mark as taken, but don't decrement workersAvailable).
    // If the player isn't already present, add a worker ref. We don't remove the
    // worker from its source here because the old semantics treated this as a
    // "visit" rather than a physical relocation.
    if (!spaceHasPlayer(targetSpace, player.id)) {
      const worker = smallestAvailableWorker(state, player)
      addWorkerRef(targetSpace, player.id, worker?.id ?? '1')
    }
    // Execute the target space's action
    return targetSpace.execute({ state, player, space: targetSpace })
  },
}
