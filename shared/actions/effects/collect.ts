import type { ActionDefinition, ActionSpace, PlayerState, Resource } from '../../contract/types'
import { trackWorkPhaseBuildingResources } from '../../session/work-phase-resources'
import { addResourcesFromBoard } from '../../session/stats'

const COLLECTABLE_RESOURCES = ['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable', 'sheep', 'boar', 'cattle'] as const
type CollectableResource = (typeof COLLECTABLE_RESOURCES)[number]

const isCollectableResource = (value: unknown): value is CollectableResource =>
  typeof value === 'string' && COLLECTABLE_RESOURCES.includes(value as CollectableResource)

export const collectAccumulatedResources = (
  player: PlayerState,
  space: ActionSpace,
) => {
  Object.keys(space.resources).forEach((key) => {
    const resourceKey = key as keyof Resource
    const amount = space.resources[resourceKey]
    if (amount > 0) {
      player.resources[resourceKey] += amount
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
  execute: ({ state, player, space, actionContext }) => {
    const spaceIdHint = actionContext?.spaceId as string | undefined
    let targetSpace: ActionSpace | undefined
    if (spaceIdHint) {
      targetSpace = spaceIdHint === space?.id
        ? space
        : state.actionSpaces.find((s) => s.id === spaceIdHint)
      if (!targetSpace) {
        return { type: 'fail' as const, logKey: 'log.collectNoSpace' }
      }
    } else {
      targetSpace = space
      if (!targetSpace) {
        return { type: 'fail' as const, logKey: 'log.collectNoSpace' }
      }
    }
    const resource = actionContext?.resource
    const amount = actionContext?.amount

    if (spaceIdHint) {
      if (!isCollectableResource(resource) || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        return { type: 'fail' as const, logKey: 'log.collectInvalidPartial' }
      }
      const have = targetSpace.resources[resource] ?? 0
      if (have < amount) return { type: 'fail' as const, logKey: 'log.collectNotEnough' }
      ;(targetSpace.resources as Record<keyof Resource, number>)[resource] = have - amount
      player.resources[resource] = (player.resources[resource] ?? 0) + amount
      const gained = { [resource]: amount } as Partial<Resource>
      trackWorkPhaseBuildingResources(state, player.id, gained as Record<string, number>)
      addResourcesFromBoard(player, gained as Record<string, number>)
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
    return { type: 'ok' as const, resourcesGained: gained }
  },
}
