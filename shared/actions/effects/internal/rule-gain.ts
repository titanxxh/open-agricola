import { evaluateRuleAmount } from '../../rule-queries'
import type { ActionDefinition } from '../../../contract/types'
import { getCardEffect } from '../../../cards/card-effects'
import { findRuleBody } from '../../timed-rules'

export const ruleGainAction: ActionDefinition = {
  id: 'rule-gain', nameKey: 'actions.gain.name', descriptionKey: 'actions.gain.description', roundAvailable: 1, gainPerRound: {}, canBeExecutedByPlayer: () => true,
  previewEffect: ({ sourceCard, params }) => {
    const match = findRuleBody(sourceCard ? getCardEffect(sourceCard)?.timedRules ?? [] : [], params)
    return match?.body.kind === 'gain' ? { kind: 'formulaGain', resources: match.body.resources } : undefined
  },
  execute: ({ state, player, sourceCard, params }) => {
    const match = findRuleBody(sourceCard ? getCardEffect(sourceCard)?.timedRules ?? [] : [], params)
    if (match?.body.kind !== 'gain') return { type: 'fail', errorKey: 'log.cardEffectFail' }
    const resources = Object.fromEntries(Object.entries(match.body.resources).flatMap(([resource, amount]) => amount === undefined ? [] : [[resource, Math.max(0, evaluateRuleAmount(state, player, amount, sourceCard))]]))
    return { type: 'flow', flow: { type: 'leaf', actionId: 'gain', sourceCard, params: resources } }
  },
}
