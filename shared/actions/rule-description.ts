import { readImprovementTypes, readAllowedPurchases } from './effects/improvement'
import { describeRuleOperation } from './rule-operation-description'
import { extendedResourceKeyList } from '../contract/state-constants'
import type { ActionExecutionContext, ChoiceDescriptionPreview, Resource } from '../contract/types'
import type { RuleBody } from '../contract/rule-plans'
import { getActionDefinition } from './action-definition-lookup'

export const describeRuleBody = (body: RuleBody, context: ActionExecutionContext): ChoiceDescriptionPreview => {
  switch (body.kind) {
    case 'action': {
      const action = getActionDefinition(body.actionId)
      const exactCost = body.policy?.exactCost ?? body.params?.exactCost
      const resourcesPaid: Partial<Resource> = {}
      if (exactCost && typeof exactCost === 'object') for (const resource of extendedResourceKeyList) {
        const amount = Object.entries(exactCost).find(([key]) => key === resource)?.[1]
        if (typeof amount === 'number' && amount > 0) resourcesPaid[resource] = amount
      }
      if (body.actionId === 'improvement') return {
        kind: 'action', labelKey: action?.nameKey ?? 'actions.improvement.name', showLabel: false,
        effectPreview: { kind: 'cardSelection', types: readImprovementTypes({ params: body.params, actionContext: body.policy }),
          ...(readAllowedPurchases(body.params) !== undefined ? { allowedCards: readAllowedPurchases(body.params) } : {}),
          ...(exactCost && typeof exactCost === 'object' && !Array.isArray(exactCost) ? { resourcesPaid } : {}),
        },
      }
      return { kind: 'action', labelKey: action?.nameKey ?? `actions.${body.actionId}.name`,
        ...(exactCost && typeof exactCost === 'object' && !Array.isArray(exactCost) ? {
          effectPreview: { kind: 'payment', resourcesPaid },
        } : {}),
      }
    }
    case 'operation': return { kind: 'action', ...(body.operation.kind === 'bounded-exchange' && body.operation.quantity === 'choose' || body.operation.kind === 'discounted-action' || body.operation.kind === 'borrow-fences' ? { optional: true } : {}), showLabel: false, labelKey: 'actions.special-effect.name', effectPreview: { kind: 'ruleOperation', operation: describeRuleOperation(body.operation, context) } }
    case 'gain': return { kind: 'action', showLabel: false, labelKey: 'actions.gain.name', effectPreview: { kind: 'formulaGain', resources: body.resources } }
    case 'optional': return { ...describeRuleBody(body.body, context), optional: true }
    case 'condition': return { kind: 'conditional', condition: body.condition, body: describeRuleBody(body.body, context) }
    case 'seq': case 'xor': case 'or': case 'parallel': return { kind: 'group', operator: body.kind === 'seq' ? 'sequence' : body.kind, separator: body.kind === 'seq' ? ', ' : ' / ', parts: body.children.map(child => describeRuleBody(child, context)) }
  }
}
