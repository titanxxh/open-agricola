import type {
  ActionAvailabilityContext,
  ActionCostPreview,
} from '../../game/types'
import {
  canAffordActionPreviewCost,
  resolveActionPreviewCost as resolveActionPreviewCostFromPay,
} from './pay-helpers'

export const resolveActionPreviewCost = (
  preview: ActionCostPreview,
  context: ActionAvailabilityContext,
  costOverride?: Partial<ActionAvailabilityContext['player']['resources']>,
) => resolveActionPreviewCostFromPay(context, preview.getBaseCost, costOverride)

export const canExecuteWithCostPreview = (
  preview: ActionCostPreview,
  context: ActionAvailabilityContext,
  costOverride?: Partial<ActionAvailabilityContext['player']['resources']>,
) => {
  if (preview.isStructurallyPossible && !preview.isStructurallyPossible(context)) {
    return false
  }
  return canAffordActionPreviewCost(context, preview.getBaseCost, costOverride)
}
