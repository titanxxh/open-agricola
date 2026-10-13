import type { ActionFlow, ActionFlowPlanningContext, ChoiceEffectPreview, PlayerState } from '../../contract/types'

export type FirstMissingResourcePlan = Omit<Extract<ChoiceEffectPreview, { kind: 'firstMissingResource' }>, 'kind'>

export const firstMissingResource = (player: PlayerState, plan: FirstMissingResourcePlan) =>
  plan.resources.find(resource => (player.resources[resource] ?? 0) <= 0)

export const createFirstMissingResourceFlow = (context: ActionFlowPlanningContext, plan: FirstMissingResourcePlan): ActionFlow | undefined => {
  if (context.previewMode === 'base') return undefined
  const resource = firstMissingResource(context.player, plan)
  return resource ? { type: 'leaf', actionId: 'gain', params: { [resource]: plan.amount } } : undefined
}

export const describeFirstMissingResourcePlan = (plan: FirstMissingResourcePlan): ChoiceEffectPreview => ({ kind: 'firstMissingResource', ...plan })
