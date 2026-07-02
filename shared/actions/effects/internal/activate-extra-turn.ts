import type { ActionDefinition } from '../../../contract/types'
import { getCardEffect } from '../../../cards/card-effects'

export const activateExtraTurnAction: ActionDefinition = {
  id: 'activate-extra-turn',
  nameKey: 'actions.activate-extra-turn.name',
  descriptionKey: 'actions.activate-extra-turn.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, params }) => {
    const cardId = params?.cardId
    if (typeof cardId !== 'string') {
      return { type: 'fail', errorKey: 'log.cardEffectFail' }
    }
    const flow = getCardEffect(cardId)?.contributeExtraTurn?.(state, player)
    if (flow) return { type: 'flow', flow }
    return { type: 'ok' }
  },
}
