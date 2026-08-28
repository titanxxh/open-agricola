import type { ActionDefinition } from '../../../contract/types'
import { beginTurnScope, endTurnScope } from '../../../cards/helpers/action-snapshot'

export const turnScopeAction: ActionDefinition = {
  id: 'turn-scope',
  nameKey: 'actions.turn-scope.name',
  descriptionKey: 'actions.turn-scope.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params }) => {
    if (params?.operation === 'begin') beginTurnScope(player)
    else if (params?.operation === 'end') endTurnScope(player)
    else return { type: 'fail', errorKey: 'log.actionFail' }
    return { type: 'ok' }
  },
}
