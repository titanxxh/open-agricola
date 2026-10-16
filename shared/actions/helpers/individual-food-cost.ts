import type { ChoiceEffectPreview, InteractionRequest, PlayerState } from '../../contract/types'

export const planIndividualFoodCost = (player: PlayerState, food: number) => {
  const foodPaid = Math.min(player.resources.food, food)
  return { foodPaid, begging: food - foodPaid }
}

export const individualFoodCostPreview = (player: PlayerState, food: number): ChoiceEffectPreview => {
  const payment = planIndividualFoodCost(player, food)
  return {
    kind: 'resourceExchange',
    resourcesPaid: payment.foodPaid > 0 ? { food: payment.foodPaid } : {},
    ...(payment.begging > 0 ? { resourcesGained: { begging: payment.begging } } : {}),
  }
}

export const individualFoodCostRequest = (player: PlayerState, food: number): InteractionRequest => ({
  kind: 'choice',
  requiresExplicitChoice: true,
  options: [{
    value: 'confirm',
    labelKey: 'ui.interactionConfirm',
    effectPreview: individualFoodCostPreview(player, food),
  }],
})
