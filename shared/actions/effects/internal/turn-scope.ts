import type { ActionDefinition, ActionFlow, PlayerState } from '../../../contract/types'
import { beginTurnScope, endTurnScope } from '../../../cards/helpers/action-snapshot'
import { getCardEffect } from '../../../cards/card-effects'

const endTurnHooks = (player: PlayerState, triggerActionId?: string): ActionFlow => ({
  type: 'seq',
  children: [
    ...[
      ...player.improvements,
      ...player.minorPlayed,
      ...player.occupationPlayed,
    ].filter((cardId) => getCardEffect(cardId)?.onEndTurn)
      .map((cardId) => ({
        type: 'leaf' as const,
        actionId: 'activate-card-effect',
        params: { cardId, hook: 'onEndTurn', ...(triggerActionId ? { triggerActionId } : {}) },
        sourceCard: cardId,
      })),
    { type: 'leaf', actionId: 'turn-scope', params: { operation: 'close' } },
  ],
})

export const turnScopeAction: ActionDefinition = {
  id: 'turn-scope',
  nameKey: 'actions.turn-scope.name',
  descriptionKey: 'actions.turn-scope.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params }) => {
    if (params?.operation === 'begin') beginTurnScope(player)
    else if (params?.operation === 'end') {
      const triggerActionId = typeof params.triggerActionId === 'string'
        ? params.triggerActionId
        : undefined
      return { type: 'flow', flow: endTurnHooks(player, triggerActionId) }
    }
    else if (params?.operation === 'close') endTurnScope(player)
    else return { type: 'fail', errorKey: 'log.actionFail' }
    return { type: 'ok' }
  },
}
