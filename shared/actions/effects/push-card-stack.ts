import type { ActionDefinition } from '../../game/types'
import { pushToCardStack } from '../../cards/helpers/card-state'

export const pushCardStackAction: ActionDefinition = {
  id: 'push-card-stack',
  nameKey: 'actions.push-card-stack.name',
  descriptionKey: 'actions.push-card-stack.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, sourceCard, params }) => {
    if (!sourceCard) {
      return { type: 'fail', logKey: 'log.actionFail' }
    }
    const items = (params as { items?: unknown[] } | undefined)?.items
    if (!Array.isArray(items) || items.length === 0) {
      return { type: 'fail', logKey: 'log.actionFail' }
    }
    const stringItems = items.map(String)
    pushToCardStack(player, sourceCard, stringItems)
    return { type: 'ok' }
  },
}
