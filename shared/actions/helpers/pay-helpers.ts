/**
 * @deprecated Will be deleted at S3 Task 10. Re-export shim during S3
 * coexistence period. New callers should import from
 * `shared/actions/payment` (PaymentSolver namespace) instead.
 */

export {
  buildPaymentChoiceResult,
  resolvePaymentSolutionSelection,
  resolveCostPaymentSelection,
  payTypedFlatCost,
  payTypedFlatCostDetailed,
  canAffordTypedFlatCost,
  executeResolvedTypedFlatPayment,
  resolveTypedFlatPaymentSelection,
  resolveCardCostWithModifiers,
  canAffordCardPreviewCostByProvider,
  payCardPreviewCostByProvider,
  resolveCardPreviewCostByProvider,
  canAffordActionPreviewCost,
  resolveActionPreviewCost,
  canAffordCost,
} from '../payment/internal'
