import { describeRuleOperation } from '../../rule-operation-description'
import { moveFarmerToSpaceAction } from './move-farmer-to-space'
import { executeActivatedRuleOperation, planMoveWorkerFromSpace } from '../../rule-activated-operation'
import type { ActionDefinition } from '../../../contract/types'
import { getCardEffect } from '../../../cards/card-effects'
import { findRuleBody } from '../../timed-rules'
import { executeFixedRuleOperation, canExecuteFixedRuleOperation } from '../../rule-fixed-operation'

export const ruleOperationAction: ActionDefinition = {
  id: 'rule-operation', nameKey: 'actions.special-effect.name', descriptionKey: 'actions.special-effect.description', roundAvailable: 1, gainPerRound: {}, canBeExecutedByPlayer: (state, player, options) => {
    const match = findRuleBody(options?.sourceCard ? getCardEffect(options.sourceCard)?.timedRules ?? [] : [], options?.params)
    if (match?.body.kind !== 'operation') return false
    switch (match.body.operation.kind) {
      case 'move-worker-from-space': {
        const flow = planMoveWorkerFromSpace(match.body.operation, { state, player, sourceCard: options?.sourceCard })
        return !!flow && moveFarmerToSpaceAction.canBeExecutedByPlayer(state, player, {
          sourceCard: flow.sourceCard, params: flow.params, actionContext: flow.actionContext,
        })
      }
      case 'put-on-action-space': case 'supply-worker-placement':
      case 'card-fact-refund': case 'take-stored-resources': case 'harvest-selected-supply-reward':
      case 'supply-worker-turn': case 'release-reserved-worker': case 'gain-per-building-resource-collected': case 'skip-next-turns':
        return true
      default: return canExecuteFixedRuleOperation(match.body.operation, { state, player, sourceCard: options?.sourceCard, space: options?.space })
    }
  },
  previewEffect: context => {
    const match = findRuleBody(context.sourceCard ? getCardEffect(context.sourceCard)?.timedRules ?? [] : [], context.params)
    return match?.body.kind === 'operation' ? { kind: 'ruleOperation', operation: describeRuleOperation(match.body.operation, context) } : undefined
  },
  execute: context => {
    const match = findRuleBody(context.sourceCard ? getCardEffect(context.sourceCard)?.timedRules ?? [] : [], context.params)
    if (match?.body.kind !== 'operation') return { type: 'fail', errorKey: 'log.cardEffectFail' }
    switch (match.body.operation.kind) {
      case 'put-on-action-space': case 'supply-worker-placement': case 'move-worker-from-space':
      case 'card-fact-refund': case 'take-stored-resources': case 'harvest-selected-supply-reward':
      case 'supply-worker-turn': case 'release-reserved-worker': case 'gain-per-building-resource-collected': case 'skip-next-turns':
        return executeActivatedRuleOperation(match.body.operation, context)
      default: return executeFixedRuleOperation(match.body.operation, context)
    }
  },
}
