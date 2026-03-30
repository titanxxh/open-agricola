import type { ActionDefinition, ActionSpace, PlayerState, Resource } from '../../game/types'
import { trackWorkPhaseBuildingResources } from '../../logic/work-phase-resources'

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
  execute: ({ state, player, space }) => {
    const gained: Record<string, number> = {}
    const resources = space.resources
    ;(['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable', 'sheep', 'boar', 'cattle'] as const).forEach((key) => {
      if (resources[key] > 0) {
        gained[key] = resources[key]
      }
    })
    collectAccumulatedResources(player, space)
    trackWorkPhaseBuildingResources(state, player.id, gained)
    return { type: 'ok' as const, resourcesGained: gained }
  },
}
