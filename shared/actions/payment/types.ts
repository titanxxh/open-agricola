import type {
  ActionExecutionResult,
  CardCostCandidateMetadata,
  CardProvidedPaymentResourceProvider,
  ComplexCost,
  CostModifierType,
  PaymentResourceMap,
  PaymentSolution,
  Resource,
} from '../../contract/types'

export type Cost = PaymentResourceMap | ComplexCost

export type Option = PaymentSolution

export type PaymentCtx = {
  actionId: string
  costType: CostModifierType | 'none'
  sourceCard?: string
  spaceId?: string
  playedCards?: string[]
  optionPrefix?: string
  paymentChoice?: string
  includeReturnedCard?: boolean
  reserveResources?: Partial<Resource>
  candidateMetadataByFeeIndex?: Record<number, CardCostCandidateMetadata>
  paymentResourceProviders?: CardProvidedPaymentResourceProvider[]
  /** Host-owned context of the issued payment menu; custom flows cannot set it. */
  actionContext?: Record<string, unknown>
}

export type PaymentExecuteError =
  | 'invalid-choice'
  | 'cannot-afford'

export type PaymentReceipt = {
  solution: PaymentSolution
  resourcesPaid: PaymentResourceMap
  bonusUsed?: string
  bonusChoiceIndex?: Record<string, number>
  returnedCardId?: string
  feeIndex?: number
  originalFeeIndex?: number
  candidateSources?: readonly string[]
  costAttribution?: CardCostCandidateMetadata['costAttribution']
  paymentResourceProviders?: CardProvidedPaymentResourceProvider[]
}

export type PaymentResolveResult =
  | { type: 'paid'; receipt: PaymentReceipt }
  | { type: 'request'; request: Extract<ActionExecutionResult, { type: 'request' }> }
  | { type: 'failed'; reason: PaymentExecuteError }
