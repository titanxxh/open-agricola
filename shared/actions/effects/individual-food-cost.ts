import type { ActionDefinition, ActionMutationContext, ActionExecutionResult, PaymentResourceMap } from '../../contract/types'
import { addCardResourceGained, addCardResourcePaid } from '../../cards/helpers/card-state'
import { individualFoodCostPreview, individualFoodCostRequest, planIndividualFoodCost } from '../helpers/individual-food-cost'

const readFoodCost = (params?: Record<string, unknown>): number | undefined => {
  const food = params?.food
  return typeof food === 'number' && Number.isSafeInteger(food) && food >= 0 ? food : undefined
}

const settleIndividualFoodCost = (
  { player, sourceCard, eventSink }: ActionMutationContext,
  food: number,
): ActionExecutionResult => {
  const payment = planIndividualFoodCost(player, food)
  const resourcesPaid: PaymentResourceMap = payment.foodPaid > 0 ? { food: payment.foodPaid } : {}
  const resourcesGained = payment.begging > 0 ? { begging: payment.begging } : {}
  player.resources.food -= payment.foodPaid
  player.resources.begging += payment.begging
  if (sourceCard) {
    addCardResourcePaid(player, sourceCard, resourcesPaid)
    addCardResourceGained(player, sourceCard, resourcesGained)
  }
  if (payment.foodPaid > 0) {
    eventSink.emit<'resource.paid'>({
      type: 'resource.paid',
      paymentId: crypto.randomUUID(),
      resources: resourcesPaid,
      paymentFor: 'cardEffect',
      paymentSources: [{ from: { kind: 'player', playerId: player.id }, resources: resourcesPaid }],
      to: { kind: 'supply' },
      ...(sourceCard ? { sourceCardId: sourceCard } : {}),
    })
  }
  if (payment.begging > 0) {
    eventSink.emit<'resource.moved'>({
      type: 'resource.moved',
      resources: resourcesGained,
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: player.id },
      reason: 'cardEffect',
      ...(sourceCard ? { sourceCardId: sourceCard } : {}),
    })
  }
  return { type: 'ok', resourcesPaid, resourcesGained }
}

export const individualFoodCostAction: ActionDefinition = {
  id: 'individual-food-cost',
  nameKey: 'actions.pay.name',
  descriptionKey: 'actions.pay.description',
  roundAvailable: 1,
  gainPerRound: {},
  skipChoiceWrap: true,
  canBeExecutedByPlayer: (_state, _player, context) => readFoodCost(context?.params) !== undefined,
  previewEffect: ({ player, params }) => {
    const food = readFoodCost(params)
    return food === undefined ? undefined : individualFoodCostPreview(player, food)
  },
  execute: context => {
    const food = readFoodCost(context.params)
    if (food === undefined) return { type: 'fail', errorKey: 'log.payFail' }
    if (planIndividualFoodCost(context.player, food).begging > 0) {
      return { type: 'request', request: individualFoodCostRequest(context.player, food), promptKey: 'ui.interactionIndividualFoodCost' }
    }
    return settleIndividualFoodCost(context, food)
  },
  resolveChoice: (context, choice) => {
    const food = readFoodCost(context.params)
    if (food === undefined || choice !== 'confirm') return { type: 'fail', errorKey: 'log.payFail', recoverable: true }
    return settleIndividualFoodCost(context, food)
  },
}
