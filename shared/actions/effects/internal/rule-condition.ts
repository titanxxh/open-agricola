import { evaluateRuleCondition } from '../../rule-queries'
import type { ActionDefinition } from '../../../contract/types'
import { getCardEffect } from '../../../cards/card-effects'
import { compileRuleBody, findRuleBody } from '../../timed-rules'
import { describeRuleBody } from '../../rule-description'

export const ruleConditionAction: ActionDefinition = {
  id: 'rule-condition', nameKey: 'actions.special-effect.name', descriptionKey: 'actions.special-effect.description', roundAvailable: 1, gainPerRound: {}, canBeExecutedByPlayer: () => true,
  previewEffect: context => {
    const match = findRuleBody(context.sourceCard ? getCardEffect(context.sourceCard)?.timedRules ?? [] : [], context.params)
    return match ? { kind: 'rule', description: describeRuleBody(match.body, context) } : undefined
  },
  execute: ({ state, player, sourceCard, params }) => {
    const match = findRuleBody(sourceCard ? getCardEffect(sourceCard)?.timedRules ?? [] : [], params)
    if (!sourceCard || match?.body.kind !== 'condition') return { type: 'fail', errorKey: 'log.cardEffectFail' }
    return evaluateRuleCondition(state, player, match.body.condition, sourceCard)
      ? { type: 'flow', flow: compileRuleBody(sourceCard, match.rule.key, match.body.body, [...match.path, 0]) } : { type: 'ok' }
  },
}
