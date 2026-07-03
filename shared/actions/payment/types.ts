import type {
  ActionExecutionResult,
  CardCostCandidateMetadata,
  CardProvidedPaymentResourceProvider,
  ComplexCost,
  CostModifierType,
  GameState,
  PaymentResourceMap,
  PaymentSolution,
  Resource,
} from '../../contract/types'

export type Cost = PaymentResourceMap | ComplexCost

export type Option = PaymentSolution

export type PaymentChoice = {
  optionIndex: number
}

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
}

export type PaymentExecuteResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: PaymentExecuteError }

export type PaymentExecuteError =
  | 'invalid-choice'
  | 'cannot-afford'
  | 'unknown-option'

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
