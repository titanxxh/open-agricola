import type { ActionDefinition } from '../../game/types'
import { incCounter } from '../../cards/__stubs__/helpers'

export const markCardTriggerAction: ActionDefinition = {
  id: 'mark-card-trigger',
  nameKey: 'actions.mark-card-trigger.name',
  descriptionKey: 'actions.mark-card-trigger.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, sourceCard }) => {
    if (!sourceCard) {
      return { type: 'fail', logKey: 'log.exchangeFail' }
    }
    incCounter(player, sourceCard, 'triggerCount')
    return { type: 'ok' }
  },
}
