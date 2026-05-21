import type { ActionFlow, Resource, ResourceKey } from '../../contract/types'

type PartialTakeFromSpaceOptions = {
  sourceCard: string
  spaceId: string
  spaceName?: string
  resource: ResourceKey
  amount?: number
  includeEffectPreview?: boolean
}

export const createPartialTakeFromSpaceLeaf = ({
  sourceCard,
  spaceId,
  spaceName,
  resource,
  amount = 1,
  includeEffectPreview,
}: PartialTakeFromSpaceOptions): ActionFlow => {
  const leaf: ActionFlow = {
    type: 'leaf',
    actionId: 'collect',
    sourceCard,
    actionContext: { spaceId, resource, amount },
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
