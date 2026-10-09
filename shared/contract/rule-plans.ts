import type { FutureMeepleResourceMap, Resource } from './types'

/** Executable purchase rules, indexed by original payment path, not actual discounted payment. */
export type PurchaseOutcomeRule =
  | { kind: 'gain'; resources: Partial<Resource> }
  | { kind: 'future-prefix'; offset: number; count: number; resources: FutureMeepleResourceMap }
