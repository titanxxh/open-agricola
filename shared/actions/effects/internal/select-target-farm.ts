import type { ActionDefinition, ActionFlow, ActionMutationContext } from '../../../contract/types'
import { getActionDefinition } from '../../action-definition-lookup'
import { legalBuildTargetFarms } from '../../flow'
import { withTargetFarm } from '../../helpers/target-farm'

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? { ...value } : undefined

const buildLeaf = (context: ActionMutationContext): Extract<ActionFlow, { type: 'leaf' }> | undefined => {
  const build = record(context.params?.build)
  if (!build || typeof build.actionId !== 'string') return undefined
  return {
    type: 'leaf', actionId: build.actionId,
    params: record(build.params), actionContext: record(build.actionContext),
    sourceCard: typeof build.sourceCard === 'string' ? build.sourceCard : undefined,
    expandFlow: build.expandFlow === true,
  }
}

export const selectTargetFarmAction: ActionDefinition = {
  id: 'select-target-farm', nameKey: 'actions.special-effect.name', descriptionKey: 'actions.special-effect.description', roundAvailable: 1, gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: context => {
    const build = buildLeaf(context)
    if (!build) return { type: 'fail', errorKey: 'log.actionFail' }
    const farms = legalBuildTargetFarms(build, context, id => context.state.actionSpaces.find(space => space.id === id) ?? getActionDefinition(id))
    if (!farms.length) return { type: 'fail', errorKey: 'log.actionFail', recoverable: true }
    return { type: 'request', promptKey: 'ui.targetFarm.prompt', sourceCard: build.sourceCard, request: {
      kind: 'choice', confirmLabelKey: 'ui.targetFarm.confirm', defaultValue: farms.some(farm => farm.id === context.player.id) ? `target-farm:${context.player.id}` : undefined,
      requiresExplicitChoice: true,
      options: farms.map(farm => ({ value: `target-farm:${farm.id}`, labelKey: farm.id === context.player.id ? 'ui.targetFarm.own' : 'ui.targetFarm.partner', labelParams: { player: farm.name } })),
    } }
  },
  resolveChoice: (context, choice) => {
    const build = buildLeaf(context)
    const farm = build && legalBuildTargetFarms(build, context, id => context.state.actionSpaces.find(space => space.id === id) ?? getActionDefinition(id)).find(candidate => `target-farm:${candidate.id}` === choice)
    if (!build || !farm) return { type: 'fail', errorKey: 'log.actionFail', recoverable: true }
    return { type: 'flow', flow: { ...build, actionContext: withTargetFarm(build.actionContext, farm.id) } }
  },
}
