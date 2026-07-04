/**
 * Internal types for the payment solver: PaymentSolution, InternalSolution,
 * Bonus, and related shapes used by enumerate / execute / cost-modifiers.
 *
 * Public types (Cost, Option, PaymentCtx, PaymentExecuteError,
 * PaymentReceipt, PaymentResolveResult) live in ../types.ts and are exported
 * via the package barrel.
 *
 * Internal to shared/actions/payment/. Not exported from the package
 * barrel (shared/actions/payment/index.ts). Use PaymentSolver from
 * the public API instead.
 */

import type { PaymentResourceCoverUsage, PaymentResourceMap, Trade } from '../../../contract/types'

export type InternalSolution = {
  resourcesRemaining: PaymentResourceMap
  tradesUsed: { trade: Trade; times: number }[]
  bonusUsed?: string
  bonusChoiceIndex?: Record<string, number>
  bonusChoiceAffectsState?: Record<string, boolean>
  bonusReductions?: Record<string, PaymentResourceMap>
  feeIndex?: number
  feeIdentity?: number
  paymentResourceCovers?: PaymentResourceCoverUsage[]
}
