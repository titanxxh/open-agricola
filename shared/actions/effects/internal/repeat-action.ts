import type { ActionDefinition } from '../../../contract/types'
import { REAL_RESOURCE_KEYS } from '../../../contract/resource-keys'
import type { Resource } from '../../../contract/types'
import type { RuleBody, RuleActionId } from '../../../contract/rule-plans'
import { compileRuleBody } from '../../timed-rules'
import { describeRuleBody } from '../../rule-description'

const actionIdFrom = (value: unknown): RuleActionId | undefined => {
  switch (value) {
    case 'occupation': case 'family-growth': case 'plow': case 'sow': case 'fence': case 'stables': case 'construct': case 'renovate-house': case 'improvement': case 'bake-bread': case 'breed': case 'gain': case 'pay': case 'bonus-vp': return value
  }
}
const bodyFrom = (params?: Record<string, unknown>): RuleBody | undefined => {
  if (typeof params?.count !== 'number' || !Number.isSafeInteger(params.count) || params.count < 1) return
  const actionId = actionIdFrom(params.actionId)
  if (!actionId) return
  const policy: NonNullable<Extract<RuleBody, { kind: 'action' }>['policy']> = {}
  const raw = params.policy
  if (raw && typeof raw === 'object') {
    if ('trueAction' in raw && raw.trueAction === false) policy.trueAction = false
    if ('exactCost' in raw && raw.exactCost && typeof raw.exactCost === 'object') {
      const resources: Partial<Resource> = {}
      for (const key of REAL_RESOURCE_KEYS) {
        const amount = Reflect.get(raw.exactCost, key)
        if (typeof amount === 'number' && amount >= 0 && Number.isFinite(amount)) resources[key] = amount
      }
      policy.exactCost = resources
    }
  }
  return { kind: 'seq', children: Array.from({ length: params.count }, () => ({ kind: 'action', actionId, policy })) }
}

export const repeatAction: ActionDefinition = {
  id: 'repeat-action', nameKey: 'actions.special-effect.name', descriptionKey: 'actions.special-effect.description', roundAvailable: 1, gainPerRound: {}, canBeExecutedByPlayer: () => true,
  previewEffect: context => {
    const body = bodyFrom(context.params)
    return body ? { kind: 'rule', description: describeRuleBody(body, context) } : undefined
  },
  execute: ({ sourceCard, params }) => {
    const body = bodyFrom(params)
    return sourceCard && body ? { type: 'flow', flow: compileRuleBody(sourceCard, '', body) } : { type: 'fail', errorKey: 'log.actionFail' }
  },
}
