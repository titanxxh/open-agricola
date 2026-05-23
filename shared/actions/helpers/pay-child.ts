import type {
  ActionExecutionResult,
  ActionFlow,
  ComplexCost,
  CostModifierType,
  InternalActionChild,
  Resource,
} from '../../contract/types'
import type { PaymentInfo } from '../../cards/card-effects'

export type PayChildOptions = {
  cost: Partial<Resource> | ComplexCost
  costType?: CostModifierType
  optionPrefix?: string
  paymentChoice?: string
  sourceCard?: string
  playedCards?: string[]
  includeReturnedCard?: boolean
  sourceActionId?: string
}

export const buildPayChild = (options: PayChildOptions): ActionFlow => ({
  type: 'leaf',
  actionId: 'pay',
  sourceCard: options.sourceCard,
  params: options,
})

export const buildInternalPayChild = (options: PayChildOptions): InternalActionChild => {
  const payChild = buildPayChild(options)
  if (payChild.type !== 'leaf') {
    throw new Error('Expected pay child leaf')
  }
  return {
    actionId: payChild.actionId,
    sourceCard: payChild.sourceCard,
    params: payChild.params,
    resultKey: 'payment',
  }
}

export const paymentInfoFromPayResult = (result: ActionExecutionResult | undefined): PaymentInfo | undefined => {
  if (!result || result.type !== 'ok') return undefined
  const extra = result.extraData ?? {}
  const resourcesPaid = (extra.resourcesPaid ?? result.resourcesPaid) as Partial<Resource> | undefined
  if (!resourcesPaid) return undefined
  return {
    resourcesPaid,
    feeIndex: typeof extra.feeIndex === 'number' ? extra.feeIndex : undefined,
    returnedCardId: typeof extra.returnedCardId === 'string' ? extra.returnedCardId : undefined,
  }
}
