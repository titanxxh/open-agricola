import type { ActionDefinition, ActionExecutionResult, Resource } from '../../../contract/types'

export const takeFromSpaceAction: ActionDefinition = {
  id: 'take-from-space',
  nameKey: 'actions.take-from-space.name',
  descriptionKey: 'actions.take-from-space.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, actionContext }): ActionExecutionResult => {
    const spaceId = actionContext?.spaceId as string | undefined
    const resource = actionContext?.resource as keyof Resource | undefined
    const amount = (actionContext?.amount as number | undefined) ?? 1
    if (!spaceId || !resource || amount <= 0) {
      return { type: 'fail', logKey: 'log.takeFromSpaceInvalid' }
    }
    const space = state.actionSpaces.find((s) => s.id === spaceId)
    if (!space?.resources) {
      return { type: 'fail', logKey: 'log.takeFromSpaceNoSpace' }
    }
    const have = (space.resources as Partial<Record<keyof Resource, number>>)[resource] ?? 0
    if (have < amount) {
      return { type: 'fail', logKey: 'log.takeFromSpaceNotEnough' }
    }
    ;(space.resources as Record<keyof Resource, number>)[resource] = have - amount
    player.resources[resource] = (player.resources[resource] ?? 0) + amount
    return {
      type: 'ok',
      resourcesGained: { [resource]: amount } as Partial<Resource>,
    }
  },
}
