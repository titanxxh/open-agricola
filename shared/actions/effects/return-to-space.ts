import type { ActionDefinition, Resource } from '../../game/types'

const canReturnResourcesToSpace = (
  resources: Partial<Resource>,
  cost: Partial<Resource> | undefined,
) =>
  Object.entries(cost ?? {}).every(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return true
    return (resources[key as keyof Resource] ?? 0) >= value
  })

export const returnToSpaceAction: ActionDefinition = {
  id: 'return-to-space',
  nameKey: 'actions.return-to-space.name',
  descriptionKey: 'actions.return-to-space.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  costPreview: {
    getBaseCost: ({ params }) => params ?? {},
  },
  execute: ({ player, space, params }) => {
    if (!canReturnResourcesToSpace(player.resources, params)) {
      return { type: 'fail', logKey: 'log.exchangeFail' }
    }
    Object.entries(params ?? {}).forEach(([key, value]) => {
      if (typeof value !== 'number' || value <= 0) return
      const resourceKey = key as keyof Resource
      player.resources[resourceKey] -= value
      space.resources[resourceKey] += value
    })
    return { type: 'ok' }
  },
}
