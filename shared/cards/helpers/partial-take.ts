import type { ActionFlow, ActionSpace, GameState, Resource, ResourceKey } from '../../contract/types'

type PartialTakeFromSpaceOptions = {
  sourceCard: string
  spaceId: string
  spaceName?: string
  resource: ResourceKey
  amount?: number
  includeEffectPreview?: boolean
  /** Runs the take as part of using this space, so collect listeners see it as `context.space`. */
  targetSpaceId?: string
}

export const createPartialTakeFromSpaceLeaf = ({
  sourceCard,
  spaceId,
  spaceName,
  resource,
  amount = 1,
  includeEffectPreview,
  targetSpaceId,
}: PartialTakeFromSpaceOptions): ActionFlow => {
  const leaf: ActionFlow = {
    type: 'leaf',
    actionId: 'collect',
    sourceCard,
    actionContext: { spaceId, resource, amount, ...(targetSpaceId ? { targetSpaceId } : {}) },
    choiceLabelKey: 'ui.interactionTakeFromSpace',
    choiceLabelParams: { resource, spaceId, spaceName: spaceName ?? spaceId },
  }
  if (includeEffectPreview) {
    leaf.effectPreview = {
      kind: 'resourceExchange',
      resourcesGained: { [resource]: amount } as Partial<Resource>,
    }
  }
  return leaf
}

type CollectStepContext = {
  state: Pick<GameState, 'actionSpaces'>
  space?: ActionSpace
  actionContext?: Record<string, unknown>
}

/** A card's take of some goods (`resource` + `amount`, or `resourceTypes`), not a whole-space collect. */
export const isPartialTake = (actionContext: Record<string, unknown> | undefined): boolean =>
  actionContext?.resource !== undefined || actionContext?.amount !== undefined || actionContext?.resourceTypes !== undefined

/**
 * How many goods of `resource` the current `collect` step takes, read before it runs:
 * a partial take's amount, the hinted space's goods for `resourceTypes`, otherwise all goods on the space.
 */
export const collectTakeAmount = (context: CollectStepContext, resource: ResourceKey): number => {
  const hints = context.actionContext ?? {}
  const target = typeof hints.spaceId === 'string'
    ? context.state.actionSpaces.find(space => space.id === hints.spaceId)
    : context.space
  if (Array.isArray(hints.resourceTypes)) return hints.resourceTypes.includes(resource) ? target?.resources[resource] ?? 0 : 0
  if (isPartialTake(hints)) return hints.resource === resource && typeof hints.amount === 'number' ? hints.amount : 0
  return target?.resources[resource] ?? 0
}
