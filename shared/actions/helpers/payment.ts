/**
 * @deprecated Will be deleted at S3 Task 10. Re-export shim during S3
 * coexistence period. New callers should import from
 * `shared/actions/payment` (PaymentSolver namespace) instead.
 */

export {
  payResources,
  canPayResources,
  applyCostOverride,
  isComplexCost,
  canPayCost,
  applyCostModifiers,
  getModifiersForCostType,
  computeAllBuyableCombinations,
  keepOnlyOptimals,
  applyTradeSideEffect,
  executePaymentSolution,
  returnCardToBoard,
  getCheapestSolution,
  clearPaymentCache,
} from '../payment/internal'

export type { InternalSolution } from '../payment/internal'
