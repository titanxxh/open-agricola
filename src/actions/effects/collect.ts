import type { ActionSpace, PlayerState, Resource } from '../../game/types'

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
