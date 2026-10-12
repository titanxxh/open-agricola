import { extendedResourceKeyList } from '../contract/state-constants'
import type { ActionExecutionContext, Resource } from '../contract/types'
import type { RuleOperation } from '../contract/rule-plans'
import type { RuleOperationPreview } from '../contract/rule-operation-previews'
import { readCardExtraData } from '../cards/helpers/card-state'
import { getStoredResource } from '../cards/helpers/card-storage'

const positiveFact = (context: ActionExecutionContext, fact: string): number => {
  const value = context.sourceCard ? readCardExtraData<unknown>(context.player, context.sourceCard, fact) : undefined
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
}

export const describeRuleOperation = (operation: RuleOperation, context: ActionExecutionContext): RuleOperationPreview => {
  switch (operation.kind) {
    case 'put-on-action-space': {
      const resources: Partial<Resource> = {}
      const occurrences = operation.occurrencesFact && context.params?.singleOccurrence !== true ? positiveFact(context, operation.occurrencesFact) : 1
      for (const resource of extendedResourceKeyList) {
        const amount = operation.resources[resource]
        if (typeof amount === 'number') resources[resource] = amount * occurrences
      }
      return { kind: operation.kind, spaceId: operation.spaceId, resources, spaceNameKey: context.state.actionSpaces.find(space => space.id === operation.spaceId)?.nameKey ?? 'actions.special-effect.name' }
    }
    case 'move-worker-from-space': return {
      ...operation, spaceNameKey: context.state.actionSpaces.find(space => space.id === operation.spaceId)?.nameKey ?? 'actions.special-effect.name',
    }
    case 'card-fact-refund': {
      const paidAmount = positiveFact(context, operation.fact)
      return { kind: operation.kind, resource: operation.resource, paidAmount, divisor: operation.divisor, amount: Math.floor(paidAmount / operation.divisor) }
    }
    case 'take-stored-resources': {
      const resources: Partial<Resource> = {}
      if (context.sourceCard) for (const resource of operation.resources) resources[resource] = getStoredResource(context.player, context.sourceCard, resource)
      return { kind: operation.kind, resources, takeAll: true }
    }
    case 'expire-extra-room': return { kind: operation.kind, removeUnhousedWorker: operation.removeUnhousedWorker }
    case 'release-reserved-worker': return { kind: operation.kind }
    case 'skip-next-turns': return { kind: operation.kind, count: positiveFact(context, operation.countFact) }
    case 'harvest-selected-supply-reward': {
      const raw = context.sourceCard ? readCardExtraData<unknown>(context.player, context.sourceCard, operation.selectionFact) : undefined
      const selected = new Set(Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === 'string') : [])
      const applications = context.state.harvestReapSummary?.[context.player.id]?.harvestCountApplications
      const applied = applications ? new Set(applications.filter(application => application.crop === operation.crop
        && selected.has(`${application.row}-${application.col}`)
        && application.tags.includes(operation.applicationTag)
        && !application.tags.includes(operation.excludedTag)).map(application => `${application.row}-${application.col}`)).size : null
      return { kind: operation.kind, crop: operation.crop, selectedFields: selected.size, appliedFields: applied }
    }
    default: return operation
  }
}
