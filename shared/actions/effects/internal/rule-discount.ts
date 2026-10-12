import { ruleDiscountModifier } from '../../rule-fixed-operation'
import type { ActionDefinition } from '../../../contract/types'
import { getCardEffect } from '../../../cards/card-effects'
import { findRuleBody } from '../../timed-rules'

export const ruleDiscountAction: ActionDefinition = {
  id: 'rule-discount', nameKey: 'actions.special-effect.name', descriptionKey: 'actions.special-effect.description', roundAvailable: 1, gainPerRound: {}, canBeExecutedByPlayer: () => true,
  execute: ({ player, sourceCard, params }) => {
    const match = findRuleBody(sourceCard ? getCardEffect(sourceCard)?.timedRules ?? [] : [], params)
    if (!sourceCard || match?.body.kind !== 'operation' || match.body.operation.kind !== 'discounted-action') return { type: 'fail', errorKey: 'log.cardEffectFail' }
    player.activeModifiers = player.activeModifiers.filter(modifier => modifier.cardId !== sourceCard)
    if (params?.install === true) player.activeModifiers.push(ruleDiscountModifier(sourceCard, match.body.operation))
    return { type: 'ok' }
  },
}
