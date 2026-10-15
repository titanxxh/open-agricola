import type { ActionDefinition, ActionFlow } from '../../../contract/types'
import { beginTurnScope, endTurnScope } from '../../../cards/helpers/action-snapshot'
import { buildEndTurnReactionFlow } from '../../../cards/helpers/end-turn-reactions'

export const turnScopeAction: ActionDefinition = {
  id: 'turn-scope',
  nameKey: 'actions.turn-scope.name',
  descriptionKey: 'actions.turn-scope.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, params }) => {
    if (params?.operation === 'begin') beginTurnScope(player)
    else if (params?.operation === 'end') {
      const triggerActionId = typeof params.triggerActionId === 'string'
        ? params.triggerActionId
        : undefined
      const reactions = buildEndTurnReactionFlow(state, player, triggerActionId)
      const flow: ActionFlow = {
        type: 'seq', children: [
          ...(reactions ? [reactions] : []),
          { type: 'leaf', actionId: 'turn-scope', params: { operation: 'close' } },
        ],
      }
      return { type: 'flow', flow }
    }
    else if (params?.operation === 'close') endTurnScope(player)
    else return { type: 'fail', errorKey: 'log.actionFail' }
    return { type: 'ok' }
  },
}
