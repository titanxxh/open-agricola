import type {
  ActionAvailabilityContext,
  ActionCostPreview,
} from '../../contract/types'
import { PaymentSolver } from '../payment'

export const resolveActionPreviewCost = (
  preview: ActionCostPreview,
  context: ActionAvailabilityContext,
  costOverride?: Partial<ActionAvailabilityContext['player']['resources']>,
) => PaymentSolver.resolveActionPreviewCost(context, preview.getBaseCost, costOverride)

export const canExecuteWithCostPreview = (
  preview: ActionCostPreview,
  context: ActionAvailabilityContext,
  costOverride?: Partial<ActionAvailabilityContext['player']['resources']>,
) => {
  if (preview.isStructurallyPossible && !preview.isStructurallyPossible(context)) {
    return false
  }
  if (preview.canExecute) {
    return preview.canExecute(context, costOverride)
  }
  return PaymentSolver.canAffordActionPreviewCost(context, preview.getBaseCost, costOverride)
}
