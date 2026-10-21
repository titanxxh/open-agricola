import type { ActionDefinition } from '../../../contract/types'
import { incCardUsed } from '../../../cards/helpers/card-state'
import { findPlayerById } from '../../../domain/player'

export const recordCardUseAction: ActionDefinition = {
  id: 'record-card-use',
  nameKey: 'actions.special-effect.name',
  descriptionKey: 'actions.special-effect.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, params }) => {
    const cardId = params?.cardId
    const owner = findPlayerById(state, params?.ownerPlayerId)
    if (typeof cardId !== 'string' || !cardId || !owner) {
      return { type: 'fail', errorKey: 'log.actionFail' }
    }
    incCardUsed(owner, cardId)
    return { type: 'ok' }
  },
}
