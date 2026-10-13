import type { ActionDefinition } from '../../../contract/types'
import { completeScheduledReceipts } from '../receive'
import { getCardEffect } from '../../../cards/card-effects'
import { roundPreparationHooks } from '../../../contract/card-effect-hooks'
import { consumeTimedRule, timedRuleOccurrences } from '../../timed-rules'

export const completePreparationAction: ActionDefinition = {
  id: 'complete-preparation', nameKey: 'actions.receive.name', descriptionKey: 'actions.receive.description',
  roundAvailable: 1, gainPerRound: {}, canBeExecutedByPlayer: () => true,
  execute: ({ state, player, params, eventSink, completedTransactionEvents }) => {
    completeScheduledReceipts(state, player, params?.futureMeepleIds, eventSink)
    const hook = roundPreparationHooks.find(hook => hook === params?.hook)
    const sources = Array.isArray(params?.timedSources) ? params.timedSources.filter((id): id is string => typeof id === 'string') : []
    if (hook) for (const cardId of sources) {
      const rules = getCardEffect(cardId)?.timedRules ?? []
      for (const occurrence of timedRuleOccurrences(state, player, cardId, rules, hook, completedTransactionEvents)) {
        if (occurrence.round === state.round && occurrence.rule.at.phase === hook && occurrence.rule.body.kind === 'optional') consumeTimedRule(player, cardId, occurrence)
      }
    }
    return { type: 'ok' }
  },
}
