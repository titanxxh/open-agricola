import type { ActionDefinition } from '../../../game/types'
import { pushToCardStack } from '../../../cards/helpers/card-state'

export const pushCardStackAction: ActionDefinition = {
  id: 'push-to-card-stack',
  nameKey: 'actions.push-to-card-stack.name',
  descriptionKey: 'actions.push-to-card-stack.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, sourceCard, params }) => {
    if (!sourceCard) {
      return { type: 'fail', logKey: 'log.actionFail' }
    }
    const item = (params as { item?: string } | undefined)?.item
    if (!item) {
      return { type: 'fail', logKey: 'log.actionFail' }
    }
    pushToCardStack(player, sourceCard, [item])
    return { type: 'ok' }
  },
}
