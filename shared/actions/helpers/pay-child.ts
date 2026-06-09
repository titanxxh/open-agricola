import type {
  ActionExecutionResult,
  ActionFlow,
  CardCostCandidateMetadata,
  ComplexCost,
  CostModifierType,
  InternalActionChild,
  PaymentResourceMap,
  Resource,
} from '../../contract/types'
import type { PaymentInfo } from '../../cards/card-effects'

export type PayChildOptions = {
  cost: PaymentResourceMap | ComplexCost
  costType?: CostModifierType
  optionPrefix?: string
  paymentChoice?: string
  sourceCard?: string
  actionContext?: Record<string, unknown>
  playedCards?: string[]
  reserveResources?: Partial<Resource>
  includeReturnedCard?: boolean
  sourceActionId?: string
  candidateMetadataByFeeIndex?: Record<number, CardCostCandidateMetadata>
}

export const buildPayChild = (options: PayChildOptions): ActionFlow => {
  const { actionContext, ...params } = options
  return {
    type: 'leaf',
    actionId: 'pay',
    sourceCard: options.sourceCard,
    actionContext,
    params,
  }
}

export const buildInternalPayChild = (options: PayChildOptions): InternalActionChild => {
  const payChild = buildPayChild(options)
  if (payChild.type !== 'leaf') {
    throw new Error('Expected pay child leaf')
  }
  return {
    actionId: payChild.actionId,
    sourceCard: payChild.sourceCard,
    params: payChild.params,
    actionContext: payChild.actionContext,
    resultKey: 'payment',
  }
}

export const paymentInfoFromPayResult = (result: ActionExecutionResult | undefined): PaymentInfo | undefined => {
  if (!result || result.type !== 'ok') return undefined
  const extra = result.extraData ?? {}
  const resourcesPaid = (extra.resourcesPaid ?? result.resourcesPaid) as PaymentResourceMap | undefined
  if (!resourcesPaid) return undefined
  return {
    resourcesPaid,
    feeIndex: typeof extra.feeIndex === 'number' ? extra.feeIndex : undefined,
    originalFeeIndex: typeof extra.originalFeeIndex === 'number' ? extra.originalFeeIndex : undefined,
    returnedCardId: typeof extra.returnedCardId === 'string' ? extra.returnedCardId : undefined,
  }
}
