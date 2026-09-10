import type { ActionDefinition, Resource } from '../../../contract/types'

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
  execute: ({ state, player, space, params, actionContext, eventSink }) => {
    const target = typeof actionContext?.targetSpaceId === 'string'
      ? state.actionSpaces.find((entry) => entry.id === actionContext.targetSpaceId) : space
    if (!target) return { type: 'fail', errorKey: 'log.exchangeFail' }
    const resources: Partial<Resource> = {}
    if (!canReturnResourcesToSpace(player.resources, params)) {
      return { type: 'fail', errorKey: 'log.exchangeFail' }
    }
    Object.entries(params ?? {}).forEach(([key, value]) => {
      if (typeof value !== 'number' || value <= 0) return
      const resourceKey = key as keyof Resource
      player.resources[resourceKey] -= value
      target.resources[resourceKey] = (target.resources[resourceKey] ?? 0) + value
      resources[resourceKey] = value
    })
    if (Object.keys(resources).length > 0) eventSink?.emit<'resource.moved'>({
      type: 'resource.moved', resources, from: { kind: 'player', playerId: player.id },
      to: { kind: 'actionSpace', spaceId: target.id }, reason: 'return',
    })
    return { type: 'ok' }
  },
}
