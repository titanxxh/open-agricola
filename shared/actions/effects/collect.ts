import type { ActionDefinition, ActionExecutionContext, ActionSpace, PlayerState, Resource } from '../../contract/types'
import type { EventSink } from '../../contract/events'
import { trackWorkPhaseBuildingResources } from '../../session/work-phase-resources'
import { addResourcesFromBoard } from '../../session/stats'
import { findActionSpaceById } from '../../domain/space'

const COLLECTABLE_RESOURCES = ['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable', 'sheep', 'boar', 'cattle'] as const
type CollectableResource = (typeof COLLECTABLE_RESOURCES)[number]

const isCollectableResource = (value: unknown): value is CollectableResource =>
  typeof value === 'string' && COLLECTABLE_RESOURCES.includes(value as CollectableResource)

const readResourceTypes = (value: unknown): CollectableResource[] | null => {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isCollectableResource)) return null
  return [...new Set(value)]
}

const retained = (context: Record<string, unknown> | undefined, key: keyof Resource): number => {
  const raw = context?.leaveOnSpace
  const value = raw && typeof raw === 'object' ? (raw as Partial<Resource>)[key] : 0
  return typeof value === 'number' && Number.isSafeInteger(value) ? Math.max(0, value) : 0
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

const collectionTarget = ({ state, space, actionContext }: Pick<ActionExecutionContext, 'state' | 'space' | 'actionContext'>): ActionSpace | undefined => {
  const hint = actionContext?.spaceId
  return typeof hint === 'string' ? hint === space.id ? space : findActionSpaceById(state, hint) : space
}

export const hasCollectableResources = (context: ActionExecutionContext): boolean => {
  const target = collectionTarget(context)
  if (!target) return false
  const { actionContext } = context
  if (actionContext?.resourceTypes !== undefined) {
    const types = readResourceTypes(actionContext.resourceTypes)
    return types !== null && types.some(resource => (target.resources[resource] ?? 0) > retained(actionContext, resource))
  }
  if (actionContext?.spaceId) {
    const { resource, amount } = actionContext
    return isCollectableResource(resource) && typeof amount === 'number' && Number.isFinite(amount)
      && amount > 0 && (target.resources[resource] ?? 0) >= amount
  }
  return COLLECTABLE_RESOURCES.some(resource => (target.resources[resource] ?? 0) > retained(actionContext, resource))
}

export const collectAction: ActionDefinition = {
  id: 'collect',
  nameKey: 'actions.collect.name',
  descriptionKey: 'actions.collect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player, context) => !!context?.space && hasCollectableResources({
    actionHooks: context.actionHooks, state, player, space: context.space, actionContext: context.actionContext,
  }),
  originalActionCondition: hasCollectableResources,
  previewEffect: context => {
    const target = collectionTarget(context)
    if (!target) return undefined
    const { actionContext, previewMode } = context
    const types = actionContext?.resourceTypes !== undefined ? readResourceTypes(actionContext.resourceTypes) : null
    const resource = actionContext?.resource
    const amount = actionContext?.amount
    if (actionContext?.spaceId && !types && isCollectableResource(resource) && typeof amount === 'number' && Number.isFinite(amount) && amount > 0) return { kind: 'resourceExchange', resourcesGained: { [resource]: amount } }
    if (previewMode === 'base') return { kind: 'collection', spaceId: target.id, spaceNameKey: target.nameKey, resourceTypes: types ?? Object.keys(positiveResources(target.gainPerRound)) as (keyof Resource)[] }
    const resources = Object.fromEntries((types ?? COLLECTABLE_RESOURCES).map(resourceType => [resourceType, Math.max(0, (target.resources[resourceType] ?? 0) - retained(actionContext, resourceType))]))
    return { kind: 'resourceExchange', resourcesGained: positiveResources(resources) }
  },
  execute: ({ state, player, space, actionContext, eventSink }) => {
    const spaceIdHint = actionContext?.spaceId as string | undefined
    const targetSpace = collectionTarget({ state, space, actionContext })
    if (!targetSpace) return { type: 'fail', errorKey: 'log.collectNoSpace' }
    const resource = actionContext?.resource
    const amount = actionContext?.amount
    const hasResourceTypes = actionContext?.resourceTypes !== undefined
    const resourceTypes = hasResourceTypes ? readResourceTypes(actionContext.resourceTypes) : null

    if (spaceIdHint) {
      if (hasResourceTypes) {
        if (!resourceTypes) return { type: 'fail', errorKey: 'log.collectInvalidPartial' }
        const gained: Partial<Resource> = {}
        for (const resourceType of resourceTypes) {
          const available = Math.max(0, (targetSpace.resources[resourceType] ?? 0) - retained(actionContext, resourceType))
          if (available <= 0) continue
          targetSpace.resources[resourceType] -= available
          player.resources[resourceType] = (player.resources[resourceType] ?? 0) + available
          gained[resourceType] = available
        }
        trackWorkPhaseBuildingResources(state, player.id, gained)
        addResourcesFromBoard(player, gained)
        emitCollectedResources(eventSink, player.id, targetSpace.id, gained)
        return { type: 'ok' as const, resourcesGained: gained }
      }
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
      const count = Math.max(0, resources[key] - retained(actionContext, key))
      if (count > 0) {
        gained[key] = count
        resources[key] -= count
        player.resources[key] = (player.resources[key] ?? 0) + count
      }
    })
    trackWorkPhaseBuildingResources(state, player.id, gained)
    addResourcesFromBoard(player, gained)
    emitCollectedResources(eventSink, player.id, targetSpace.id, gained)
    return { type: 'ok' as const, resourcesGained: gained }
  },
}
