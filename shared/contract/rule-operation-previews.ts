import type { Resource } from './types'
import type { RuleFixedOperation } from './rule-fixed-operations'

/** Closed public consequences; source state keys and harvest tags stay on the server. */
export type RuleActivatedOperationPreview =
  | { kind: 'put-on-action-space'; spaceId: string; spaceNameKey: string; resources: Partial<Resource> }
  | { kind: 'supply-worker-placement' }
  | { kind: 'supply-worker-turn' }
  | { kind: 'move-worker-from-space'; spaceId: string; spaceNameKey: string }
  | { kind: 'card-fact-refund'; resource: keyof Resource; paidAmount: number; amount: number; divisor: number }
  | { kind: 'take-stored-resources'; resources: Partial<Resource>; takeAll: true }
  | { kind: 'harvest-selected-supply-reward'; crop: 'grain' | 'vegetable'; selectedFields: number; appliedFields: number | null }
  | { kind: 'release-reserved-worker' }
  | { kind: 'gain-per-building-resource-collected'; resource: keyof Resource; perBuildingResource: number }
  | { kind: 'skip-next-turns'; count: number }
export type RuleFixedOperationPreview = Exclude<RuleFixedOperation, { kind: 'expire-extra-room' }>
  | Omit<Extract<RuleFixedOperation, { kind: 'expire-extra-room' }>, 'fact'>

export type RuleOperationPreview = RuleFixedOperationPreview | RuleActivatedOperationPreview
