import type { ActionDefinition } from '../../../contract/types'
import { getCardEffect } from '../../../cards/card-effects'
import { compileRuleBody, consumeTimedRule, timedRuleOccurrences } from '../../timed-rules'
import { describeRuleBody } from '../../rule-description'
import { evaluateFlowDoable, type FlowActionResolver } from '../../flow'
import { roundPreparationHooks } from '../../../contract/card-effect-hooks'

export const resolveTimedRuleAction: ActionDefinition = {
  id: 'resolve-timed-rule', nameKey: 'actions.special-effect.name', descriptionKey: 'actions.special-effect.description', roundAvailable: 1, gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  previewEffect: context => {
    const rule = context.sourceCard ? getCardEffect(context.sourceCard)?.timedRules?.find(rule => rule.key === context.params?.ruleKey) : undefined
    return rule ? { kind: 'rule', description: describeRuleBody(rule.body, context) } : undefined
  },
  execute: ({ state, player, sourceCard, params, completedTransactionEvents }) => {
    if (!sourceCard) return { type: 'fail', errorKey: 'log.cardEffectFail' }
    const rules = getCardEffect(sourceCard)?.timedRules ?? []
    const executingRule = rules.find(rule => rule.key === params?.ruleKey)
    const occurrence = timedRuleOccurrences(state, player, sourceCard, rules, executingRule?.at.phase, completedTransactionEvents).find(entry => entry.identity === params?.identity && entry.rule.key === params?.ruleKey && entry.round === state.round)
    if (!occurrence) return { type: 'ok' }
    consumeTimedRule(player, sourceCard, occurrence)
    return { type: 'flow', flow: compileRuleBody(sourceCard, occurrence.rule.key, occurrence.rule.body) }
  },
}

export const createResolveTimedRuleAction = (resolveAction: FlowActionResolver): ActionDefinition => ({
  ...resolveTimedRuleAction,
  canBeExecutedByPlayer: (state, player, context) => {
    const cardId = context?.sourceCard
    const rule = cardId ? getCardEffect(cardId)?.timedRules?.find(rule => rule.key === context?.params?.ruleKey) : undefined
    if (!rule || !cardId) return false
    if (!roundPreparationHooks.some(hook => hook === rule.at.phase)) return true
    return evaluateFlowDoable({ ...compileRuleBody(cardId, rule.key, rule.body), optional: false }, {
      actionHooks: context?.actionHooks, state, player, space: context?.space ?? state.actionSpaces[0]!,
    }, resolveAction)
  },
})
