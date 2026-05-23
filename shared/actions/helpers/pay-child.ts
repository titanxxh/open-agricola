import type { ActionExecutionResult, ActionFlow, ComplexCost, CostModifierType, Resource } from '../../contract/types'
import type { PaymentInfo } from '../../cards/card-effects'

export type PayChildOptions = {
  cost: Partial<Resource> | ComplexCost
  costType?: CostModifierType
  optionPrefix?: string
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
