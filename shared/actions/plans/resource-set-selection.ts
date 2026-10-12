import type { ActionDefinition, ActionExecutionResult, ChoiceEffectPreview, PlayerState, Resource } from '../../contract/types'
import type { PromptKey } from '../../contract/prompt-keys'
import { readCardExtraData } from '../../cards/helpers/card-state'

export type ResourceSetSelectionPlan = {
  choices: readonly (keyof Resource)[]
  countsByUse: readonly [number, ...number[]]
  resourcesPerChoice: number
  extraGain: Partial<Resource>
  usageFact: string
  promptKey: PromptKey
}

const readUseIndex = (player: PlayerState, sourceCard: string, plan: ResourceSetSelectionPlan): number =>
  readCardExtraData<number>(player, sourceCard, plan.usageFact) ?? 0

export const canUseResourceSetSelection = (player: PlayerState, sourceCard: string, plan: ResourceSetSelectionPlan): boolean => {
  const index = readUseIndex(player, sourceCard, plan)
  return Number.isInteger(index) && index >= 0 && index < plan.countsByUse.length
}

/** Choice count, rewards, request and resolution all read the same closed plan. */
export const createResourceSetSelectionAction = (sourceCard: string, id: string, plan: ResourceSetSelectionPlan): ActionDefinition => {
  const currentCount = (player: PlayerState) => plan.countsByUse[readUseIndex(player, sourceCard, plan)] ?? plan.countsByUse[0]
  const request = (player: PlayerState): ActionExecutionResult => ({
    type: 'request', request: { kind: 'choice',
      options: plan.choices.map(resource => ({ value: resource, labelKey: `resources.${resource}`, sourceCard,
        effectPreview: { kind: 'resourceExchange', resourcesGained: { [resource]: plan.resourcesPerChoice } },
      })),
      structuredChoicePrefixes: [...plan.choices],
    },
    promptKey: plan.promptKey, promptParams: { needed: currentCount(player) },
  })
  return {
    id, nameKey: `cards.${sourceCard}.name`, descriptionKey: `cards.${sourceCard}.desc`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: (_state, player) => canUseResourceSetSelection(player, sourceCard, plan),
    previewEffect: ({ player, previewMode }): Extract<ChoiceEffectPreview, { kind: 'resourceSetSelection' }> => ({
      kind: 'resourceSetSelection', choices: [...plan.choices], resourcesPerChoice: plan.resourcesPerChoice, extraGain: { ...plan.extraGain },
      minDistinct: previewMode === 'base' ? Math.min(...plan.countsByUse) : currentCount(player),
      maxDistinct: previewMode === 'base' ? Math.max(...plan.countsByUse) : currentCount(player),
      ...(previewMode === 'base' ? { quantitiesByUse: [...plan.countsByUse] } : {}),
    }),
    execute: ({ player }) => request(player),
    resolveChoice: ({ player }, choice) => {
      const selected = [...new Set(choice.split(',').filter(resource => plan.choices.some(candidate => candidate === resource)))]
      if (selected.length !== currentCount(player)) return request(player)
      const resources: Partial<Resource> = { ...plan.extraGain }
      for (const resource of plan.choices) if (selected.includes(resource)) resources[resource] = (resources[resource] ?? 0) + plan.resourcesPerChoice
      return { type: 'flow', flow: { type: 'seq', children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard, params: { kind: 'increment-extra-data', key: plan.usageFact, amount: 1 } },
        { type: 'leaf', actionId: 'gain', sourceCard, params: resources },
      ] } }
    },
  }
}
