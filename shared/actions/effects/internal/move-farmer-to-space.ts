import type { ActionDefinition, ActionSpace } from '../../../contract/types'
import type { EventSink } from '../../../contract/events'
import { addWorkerRef, spaceHasPlayer } from '../../../domain/space'
import { smallestAvailableWorker } from '../../../domain/player'
import { computeAllowedPlacementSpaces, type AllowedPlacement } from '../../helpers/placement-availability'

/**
 * Move a farmer from a source action space to another selectable action space and execute it.
 * Used by D51_Archway (move from Archway) and E10_StrawHat (move from Farmland).
 *
 * - execute(): lists selectable spaces (excluding params.excludeSpaceId) → returns choice
 * - resolveChoice(): marks target space as takenBy, executes the space's action
 */
const withForwardedActionSource = (
  eventSink: EventSink,
  sourceActionId: string,
): EventSink => ({
  emit: (event) => eventSink.emit({ sourceActionId, ...event }),
  emitMany: (events) => {
    events.forEach((event) => eventSink.emit({ sourceActionId, ...event }))
  },
})

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
  execute: ({ state, player, params }) => {
    const excludeId = params?.excludeSpaceId as string | undefined
    const allowed = computeAllowedPlacementSpaces(state, player)
    const spaces = state.actionSpaces.filter((s) => isSelectableSpace(s, excludeId, allowed))
    if (spaces.length === 0) return { type: 'fail', logKey: 'log.actionFail' }
    return {
      type: 'request',
      request: {
        kind: 'choice',
        options: spaces.map((s) => ({ value: s.id, labelKey: s.nameKey })),
      },
      promptKey: 'ui.interactionMoveFarmerToSpace',
    }
  },
  resolveChoice: ({ state, player, eventSink }, choice) => {
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
    return targetSpace.execute({
      state,
      player,
      space: targetSpace,
      eventSink: withForwardedActionSource(eventSink, targetSpace.id),
    })
  },
}
