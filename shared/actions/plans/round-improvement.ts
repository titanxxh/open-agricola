import type { ActionFlow, ActionFlowPlanningContext, ChoiceEffectPreview } from '../../contract/types'

export type RoundImprovementPlan = Extract<ChoiceEffectPreview, { kind: 'roundCardSelection' }>['ranges']

export const improvementTypesForRound = (round: number, plan: RoundImprovementPlan) =>
  [...(plan.find(entry => round >= entry.from && (entry.to === undefined || round <= entry.to))?.types ?? [])]

export const createRoundImprovementFlow = (context: ActionFlowPlanningContext, plan: RoundImprovementPlan): ActionFlow | undefined => {
  if (context.previewMode === 'base') return undefined
  const types = improvementTypesForRound(context.state.round, plan)
  return types.length ? { type: 'leaf', actionId: 'improvement', actionContext: { types } } : undefined
}

export const describeRoundImprovementPlan = (plan: RoundImprovementPlan): ChoiceEffectPreview => ({ kind: 'roundCardSelection', ranges: plan })
