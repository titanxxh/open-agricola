import type { ActionDefinition, ActionSpace, PlayerState, Resource } from '../../contract/types'
import type { EventSink } from '../../contract/events'
import { trackWorkPhaseBuildingResources } from '../../session/work-phase-resources'
import { addResourcesFromBoard } from '../../session/stats'
import { findActionSpaceById } from '../../domain/space'

const COLLECTABLE_RESOURCES = ['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable', 'sheep', 'boar', 'cattle'] as const
type CollectableResource = (typeof COLLECTABLE_RESOURCES)[number]

const isCollectableResource = (value: unknown): value is CollectableResource =>
  typeof value === 'string' && COLLECTABLE_RESOURCES.includes(value as CollectableResource)

const readAllActionSpaceResourceTypes = (value: unknown): CollectableResource[] | null => {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isCollectableResource)) return null
  return [...new Set(value)]
}

const positiveResources = (resources: Partial<Resource>): Partial<Resource> => {
  const out: Partial<Resource> = {}
  Object.entries(resources).forEach(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return
    out[key as keyof Resource] = value
  })
  return out
}

const emitCollectedResources = (
  eventSink: EventSink | undefined,
  playerId: string,
  spaceId: string,
  resources: Partial<Resource>,
) => {
  const gained = positiveResources(resources)
  if (Object.keys(gained).length === 0) return
  eventSink?.emit<'resource.moved'>({
    type: 'resource.moved',
    resources: gained,
    from: { kind: 'actionSpace', spaceId },
    to: { kind: 'player', playerId },
    reason: 'collect',
  })
}

export const collectAccumulatedResources = (
  player: PlayerState,
  space: ActionSpace,
) => {
  Object.keys(space.resources).forEach((key) => {
    const resourceKey = key as keyof Resource
    const amount = space.resources[resourceKey] ?? 0
    if (amount > 0) {
      player.resources[resourceKey] = (player.resources[resourceKey] ?? 0) + amount
      space.resources[resourceKey] = 0
    }
  })
}

export const collectAction: ActionDefinition = {
  id: 'collect',
  nameKey: 'actions.collect.name',
  descriptionKey: 'actions.collect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, space, actionContext, eventSink }) => {
    const hasAllSpaceRequest = actionContext?.allActionSpaceResourceTypes !== undefined
    const allActionSpaceResourceTypes = hasAllSpaceRequest
      ? readAllActionSpaceResourceTypes(actionContext.allActionSpaceResourceTypes)
      : null
    if (hasAllSpaceRequest) {
      if (!allActionSpaceResourceTypes) {
        return { type: 'fail', errorKey: 'log.collectInvalidPartial' }
      }
      const total: Partial<Resource> = {}
      for (const actionSpace of state.actionSpaces) {
        const fromSpace: Partial<Resource> = {}
        for (const resource of allActionSpaceResourceTypes) {
          const amount = actionSpace.resources[resource] ?? 0
          if (amount <= 0) continue
          actionSpace.resources[resource] = 0
          player.resources[resource] = (player.resources[resource] ?? 0) + amount
          fromSpace[resource] = amount
          total[resource] = (total[resource] ?? 0) + amount
        }
        emitCollectedResources(eventSink, player.id, actionSpace.id, fromSpace)
      }
      trackWorkPhaseBuildingResources(state, player.id, total)
      addResourcesFromBoard(player, total)
      return { type: 'ok' as const, resourcesGained: total }
    }

    const spaceIdHint = actionContext?.spaceId as string | undefined
    let targetSpace: ActionSpace | undefined
    if (spaceIdHint) {
      targetSpace = spaceIdHint === space?.id
        ? space
        : findActionSpaceById(state, spaceIdHint)
      if (!targetSpace) {
        return { type: 'fail', errorKey: 'log.collectNoSpace' }
      }
    } else {
      targetSpace = space
      if (!targetSpace) {
        return { type: 'fail', errorKey: 'log.collectNoSpace' }
      }
    }
    const resource = actionContext?.resource
    const amount = actionContext?.amount

    if (spaceIdHint) {
      if (!isCollectableResource(resource) || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        return { type: 'fail', errorKey: 'log.collectInvalidPartial' }
      }
      const have = targetSpace.resources[resource] ?? 0
      if (have < amount) return { type: 'fail', errorKey: 'log.collectNotEnough' }
      ;(targetSpace.resources as Record<keyof Resource, number>)[resource] = have - amount
      player.resources[resource] = (player.resources[resource] ?? 0) + amount
      const gained = { [resource]: amount } as Partial<Resource>
      trackWorkPhaseBuildingResources(state, player.id, gained as Record<string, number>)
      addResourcesFromBoard(player, gained as Record<string, number>)
      emitCollectedResources(eventSink, player.id, targetSpace.id, gained)
      return { type: 'ok' as const, resourcesGained: gained }
    }

    const gained: Record<string, number> = {}
    const resources = targetSpace.resources
    COLLECTABLE_RESOURCES.forEach((key) => {
      if (resources[key] > 0) gained[key] = resources[key]
    })
    collectAccumulatedResources(player, targetSpace)
    trackWorkPhaseBuildingResources(state, player.id, gained)
    addResourcesFromBoard(player, gained)
    emitCollectedResources(eventSink, player.id, targetSpace.id, gained)
    return { type: 'ok' as const, resourcesGained: gained }
  },
}
