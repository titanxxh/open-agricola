import type { ActionDefinition } from '../../game/types'
import { incCounter } from '../../cards/__stubs__/helpers'

export const markCardObservedAction: ActionDefinition = {
  id: 'mark-card-observed',
  nameKey: 'actions.mark-card-observed.name',
  descriptionKey: 'actions.mark-card-observed.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, sourceCard }) => {
    if (!sourceCard) {
      return { type: 'fail', logKey: 'log.exchangeFail' }
    }
    incCounter(player, sourceCard, 'observedCount')
    return { type: 'ok' }
  },
}
