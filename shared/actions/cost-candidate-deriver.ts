import type { PaymentResourceMap } from '../contract/types'

export type CostCandidateMetadata = {
  sourceCards: string[]
}

export type CostCandidate = {
  cost: PaymentResourceMap
  feeIndex?: number
  metadata: CostCandidateMetadata
  applied: Set<string>
}

export type DerivedCostCandidate = {
  cost: PaymentResourceMap
}

export type CostCandidateDerivationContext = {
  actionId: string
  targetCardId?: string
  targetPlayKind?: 'major' | 'minor'
  targetCardTypes?: Array<'major' | 'minor'>
  actionCardId?: string
}

export type CostCandidateDeriver = {
  id: string
  sourceCardId: string
  derive(
    candidate: CostCandidate,
    context: CostCandidateDerivationContext,
  ): DerivedCostCandidate[]
}
