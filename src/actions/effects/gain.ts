import type { PlayerState, Resource } from '../../game/types'

export const gainResources = (
  player: PlayerState,
  resources: Partial<Resource>,
) => {
  Object.keys(resources).forEach((key) => {
    const resourceKey = key as keyof Resource
    const amount = resources[resourceKey] ?? 0
    if (amount > 0) {
      player.resources[resourceKey] += amount
    }
  })
}
