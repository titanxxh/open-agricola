/**
 * @deprecated Will be deleted at S3 Task 10. Re-export shim during S3
 * coexistence period. New callers should import from
 * `shared/actions/payment` (PaymentSolver namespace) instead.
 */

export {
  buildRoomCostPerUnit,
  getBuildRoomCost,
  getMaxBuildableRooms,
  executeResolvedRoomPayment,
  resolveRoomPaymentSelection,
} from '../payment/internal'
